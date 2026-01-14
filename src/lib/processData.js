import {
  ALARM_MAPPING, SEVERITY_MAP, detectProduct, ALL_RELAYS, THRESHOLDS,
  COMPOUND_FAULTS, PRODUCT_SPECS
} from './thresholds';
import {
  cleanKey, parseDate, getVal, findSheet,
  formatInsulation, iterativeMergeSort
} from './parsers';

const DEBUG = false;

// ====================================================================
// ANOMALY DETECTION HELPER FUNCTIONS
// ====================================================================

/**
 * Determine if system is currently charging based on current and state
 */
const isCharging = (current, systemState) => {
  if (current != null && current < -1) return true; // Negative current = charging
  if (systemState && typeof systemState === 'string') {
    const lower = systemState.toLowerCase();
    if (lower.includes('charg') && !lower.includes('discharg')) return true;
  }
  return false;
};

/**
 * Determine if system is currently discharging
 */
const isDischarging = (current, systemState) => {
  if (current != null && current > 1) return true; // Positive current = discharging
  if (systemState && typeof systemState === 'string') {
    const lower = systemState.toLowerCase();
    if (lower.includes('discharg')) return true;
  }
  return false;
};

/**
 * Calculate rate of change between two data points
 */
const calculateRate = (currentValue, previousValue, timeDeltaMs) => {
  if (currentValue == null || previousValue == null || timeDeltaMs <= 0) return null;
  return (currentValue - previousValue) / (timeDeltaMs / 1000); // per second
};

/**
 * Validate data quality - returns array of issues found
 */
const validateDataPoint = (e, T) => {
  const issues = [];
  const dv = T.dataValidation;

  // Cell voltage validation
  const cellVoltages = Object.values(e.cells || {}).filter(v => v != null);
  for (const v of cellVoltages) {
    if (v < dv.cellVoltage.min || v > dv.cellVoltage.max) {
      issues.push({ type: 'sensor_fault', param: 'cellVoltage', value: v, message: `Cell voltage ${v}mV outside valid range` });
    }
  }

  // Temperature validation
  const temps = Object.entries(e).filter(([k]) => /^temp\d+$/.test(k)).map(([,v]) => v).filter(v => v != null);
  for (const t of temps) {
    if (t < dv.temperature.min || t > dv.temperature.max) {
      issues.push({ type: 'sensor_fault', param: 'temperature', value: t, message: `Temperature ${t}°C outside valid range` });
    }
  }

  // SOC validation
  if (e.soc != null && (e.soc < dv.soc.min || e.soc > dv.soc.max)) {
    issues.push({ type: 'data_fault', param: 'soc', value: e.soc, message: `SOC ${e.soc}% outside valid range 0-100%` });
  }

  return issues;
};

export const processData = (sheets) => {
  if (DEBUG) console.log('Processing sheets:', Object.keys(sheets));

  const voltages = findSheet(sheets, 'voltage', '0x9a');
  const temps = findSheet(sheets, 'temperature', '0x09');
  const peaks = findSheet(sheets, 'peak', '0x9b');
  const system = findSheet(sheets, 'system state', '0x93');
  const alarms = findSheet(sheets, 'alarm', '0x87');
  const devInfo = findSheet(sheets, 'device info', '0x92');
  const devList = findSheet(sheets, 'device list', '0x82');
  const balancing = findSheet(sheets, 'balancing', '0x86');
  const energy = findSheet(sheets, 'energy', '0x89');
  const charging = findSheet(sheets, 'charging', '0x99');

  const dataMap = new Map();
  const detectedAnomalies = [];

  const findColumn = (row, ...keys) => {
    if (!row) return null;
    const rowKeys = Object.keys(row);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const keyLower = key.toLowerCase();
      for (let j = 0; j < rowKeys.length; j++) {
        const k = rowKeys[j];
        const clean = cleanKey(k);
        if (clean === key || clean.toLowerCase().includes(keyLower)) return k;
      }
    }
    return null;
  };

  let minCellIndex = null;
  let maxCellIndex = null;

  const voltageSample = voltages[0] || {};
  const voltageTimeCol = findColumn(voltageSample, 'Time');
  const voltagePackCol = findColumn(voltageSample, 'Pack volt.(V)');
  const voltageCurrentCol = findColumn(voltageSample, 'Current(A)');
  const voltageCellKeys = [];
  const voltageSampleKeys = Object.keys(voltageSample);
  for (let i = 0; i < voltageSampleKeys.length; i++) {
    const k = voltageSampleKeys[i];
    const m = cleanKey(k).match(/Cell volt\.N\+(\d+)/i);
    if (m) {
      const idx = parseInt(m[1], 10);
      if (!isNaN(idx)) voltageCellKeys.push({ key: k, idx });
    }
  }

  // Process VOLTAGES - Use for loop instead of forEach to avoid stack overflow
  for (let rowIdx = 0; rowIdx < voltages.length; rowIdx++) {
    const row = voltages[rowIdx];
    const timeVal = voltageTimeCol ? row[voltageTimeCol] : getVal(row, 'Time');
    const t = parseDate(timeVal);
    if (!t) continue;
    const ts = t.getTime();
    const dateKey = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;

    if (!dataMap.has(ts)) {
      dataMap.set(ts, {
        time: t, ts, dateKey,
        timeStr: t.toLocaleTimeString(),
        fullTime: t.toLocaleString(),
        cells: {},
        relays: {}
      });
    }
    const e = dataMap.get(ts);

    const packVal = voltagePackCol ? row[voltagePackCol] : getVal(row, 'Pack volt.(V)');
    e.packVoltage = parseFloat(packVal) || undefined;
    const currVal = voltageCurrentCol ? row[voltageCurrentCol] : getVal(row, 'Current(A)');
    const curr = parseFloat(currVal);
    e.current = isNaN(curr) ? undefined : curr;

    // Extract ALL cell voltages and check for anomalies
    let hasAnomaly = false;
    const anomalyCells = [];
    let firstCellLogged = false;

    if (voltageCellKeys.length > 0) {
      for (let i = 0; i < voltageCellKeys.length; i++) {
        const cellKey = voltageCellKeys[i];
        const cellIdx = cellKey.idx;
        // DEBUG: Log first cell voltage column to determine if 0-based or 1-based
        if (DEBUG && rowIdx === 0 && !firstCellLogged) {
          console.log('=== CELL INDEXING DEBUG ===');
          console.log('First cell voltage column name:', cellKey.key);
          console.log('Extracted cell index:', cellIdx);
          console.log('Clean key:', cleanKey(cellKey.key));
          firstCellLogged = true;
        }
        const v = parseFloat(row[cellKey.key]);
        if (!isNaN(v)) {
          e.cells[cellIdx] = v;
          e[`cell${cellIdx}`] = v;
          if (minCellIndex === null || cellIdx < minCellIndex) minCellIndex = cellIdx;
          if (maxCellIndex === null || cellIdx > maxCellIndex) maxCellIndex = cellIdx;

          // Check for anomalies using three-level thresholds
          if (v > THRESHOLDS.cellVoltage.absoluteMax || v < THRESHOLDS.cellVoltage.absoluteMin) {
            hasAnomaly = true;
            anomalyCells.push({ cell: cellIdx, voltage: v });
          }
        }
      }
    } else {
      const rowKeys = Object.keys(row);
      for (let i = 0; i < rowKeys.length; i++) {
        const k = rowKeys[i];
        const m = cleanKey(k).match(/Cell volt\.N\+(\d+)/i);
        if (m) {
          const cellIdx = parseInt(m[1]);
          if (DEBUG && rowIdx === 0 && !firstCellLogged) {
            console.log('=== CELL INDEXING DEBUG ===');
            console.log('First cell voltage column name:', k);
            console.log('Extracted cell index:', cellIdx);
            console.log('Clean key:', cleanKey(k));
            firstCellLogged = true;
          }
          const v = parseFloat(row[k]);
          if (!isNaN(v)) {
            e.cells[cellIdx] = v;
            e[`cell${cellIdx}`] = v;
            if (minCellIndex === null || cellIdx < minCellIndex) minCellIndex = cellIdx;
            if (maxCellIndex === null || cellIdx > maxCellIndex) maxCellIndex = cellIdx;

            if (v > THRESHOLDS.cellVoltage.absoluteMax || v < THRESHOLDS.cellVoltage.absoluteMin) {
              hasAnomaly = true;
              anomalyCells.push({ cell: cellIdx, voltage: v });
            }
          }
        }
      }
    }

    // DEBUG: After processing all cells in first row, log all cell keys
    if (DEBUG && rowIdx === 0 && Object.keys(e.cells).length > 0) {
      const cellKeys = Object.keys(e).filter(k => k.startsWith('cell'));
      console.log('All cell keys after processing first row:', cellKeys);
      console.log('Cell count:', cellKeys.length);
      console.log('Sample cell values:', cellKeys.slice(0, 5).map(k => `${k}=${e[k]}`).join(', '));
    }

    // Check for cell imbalance (voltage spread) using PSI three-level system
    if (e.cellDiff && e.cellDiff > THRESHOLDS.cellDelta.level3) {
      detectedAnomalies.push({
        type: 'imbalance',
        time: t,
        timeStr: t.toLocaleString(),
        rowIdx,
        description: `CRITICAL cell imbalance: ${e.cellDiff}mV spread (>${THRESHOLDS.cellDelta.level3}mV) - Bad cell or connection, risk of reversal`,
        cells: [],
        severity: 3
      });
    } else if (e.cellDiff && e.cellDiff > THRESHOLDS.cellDelta.level2) {
      detectedAnomalies.push({
        type: 'imbalance',
        time: t,
        timeStr: t.toLocaleString(),
        rowIdx,
        description: `WARNING cell imbalance: ${e.cellDiff}mV spread (>${THRESHOLDS.cellDelta.level2}mV) - Weak cell suspected, limit depth of discharge`,
        cells: [],
        severity: 2
      });
    } else if (e.cellDiff && e.cellDiff > THRESHOLDS.cellDelta.level1) {
      detectedAnomalies.push({
        type: 'imbalance',
        time: t,
        timeStr: t.toLocaleString(),
        rowIdx,
        description: `Cell imbalance detected: ${e.cellDiff}mV spread (>${THRESHOLDS.cellDelta.level1}mV) - BMS balancing should correct`,
        cells: [],
        severity: 1
      });
    }

    if (hasAnomaly) {
      detectedAnomalies.push({
        type: 'voltage',
        time: t,
        timeStr: t.toLocaleString(),
        rowIdx,
        description: `Abnormal cell voltages detected`,
        cells: anomalyCells,
        severity: anomalyCells.some(c => c.voltage > 10000) ? 3 : 2
      });
    }
  }

  // Process TEMPERATURES - Use for loop instead of forEach to avoid stack overflow
  for (let i = 0; i < temps.length; i++) {
    const row = temps[i];
    const t = parseDate(getVal(row, 'Time'));
    if (!t) continue;
    const ts = t.getTime();
    const dateKey = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;

    if (!dataMap.has(ts)) {
      dataMap.set(ts, { time: t, ts, dateKey, cells: {}, relays: {} });
    }
    const e = dataMap.get(ts);

    const tempKeys = Object.keys(row);
    for (let j = 0; j < tempKeys.length; j++) {
      const k = tempKeys[j];
      const cleaned = cleanKey(k);
      // Match CellTemp1(℃) or CellTemp1 format
      const m = cleaned.match(/CellTemp(\d+)/i);
      if (m) {
        const v = parseFloat(row[k]);
        if (!isNaN(v) && v > -50 && v < 150) e[`temp${m[1]}`] = v;
      }
    }
  }

  // Process PEAKS - Use for loop instead of forEach to avoid stack overflow
  for (let i = 0; i < peaks.length; i++) {
    const row = peaks[i];
    const t = parseDate(getVal(row, 'Time'));
    if (!t) continue;
    const ts = t.getTime();
    const dateKey = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;

    if (!dataMap.has(ts)) {
      dataMap.set(ts, { time: t, ts, dateKey, cells: {}, relays: {} });
    }
    const e = dataMap.get(ts);

    e.maxCellV = parseFloat(getVal(row, 'Max cell(mv)')) || undefined;
    e.minCellV = parseFloat(getVal(row, 'Min cell(mv)')) || undefined;
    e.maxCellId = getVal(row, 'Cell ID of max volt');
    e.minCellId = getVal(row, 'Cell ID of min');
    e.maxTemp = parseFloat(getVal(row, 'Max temp.(℃)', 'Max temp')) || undefined;
    e.minTemp = parseFloat(getVal(row, 'Min temp.(℃)', 'Min temp')) || undefined;
    e.maxTempId = getVal(row, 'Max temp. ID');
    e.minTempId = getVal(row, 'Min temp. ID');

    if (e.maxCellV && e.minCellV) e.cellDiff = e.maxCellV - e.minCellV;
    if (e.maxTemp != null && e.minTemp != null && e.maxTemp > -40 && e.minTemp > -40) {
      e.tempDiff = e.maxTemp - e.minTemp;
    }
  }

  // Process SYSTEM STATE - Use for loop instead of forEach to avoid stack overflow
  for (let i = 0; i < system.length; i++) {
    const row = system[i];
    const t = parseDate(getVal(row, 'Time'));
    if (!t) continue;
    const ts = t.getTime();
    const dateKey = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;

    if (!dataMap.has(ts)) {
      dataMap.set(ts, { time: t, ts, dateKey, cells: {}, relays: {} });
    }
    const e = dataMap.get(ts);

    e.soc = parseFloat(getVal(row, 'Shown SOC', 'Real SOC')) || undefined;
    e.realSoc = parseFloat(getVal(row, 'Real SOC')) || undefined;
    e.soh = parseFloat(getVal(row, 'SOH')) || undefined;
    e.systemState = getVal(row, 'System state');
    e.insulationRes = parseFloat(getVal(row, 'Sys. insul. resistance')) || undefined;
    e.posInsulation = parseFloat(getVal(row, 'Pos. insulation')) || undefined;
    e.negInsulation = parseFloat(getVal(row, 'Neg. insulation')) || undefined;

    // Parse SW1, SW2, DI1, DI2 states
    e.sw1 = getVal(row, 'SW1');
    e.sw2 = getVal(row, 'SW2');
    e.di1 = getVal(row, 'DI1');
    e.di2 = getVal(row, 'DI2');

    // Parse additional system metrics
    e.heartbeat = getVal(row, 'Heartbeat');
    e.powerVolt = parseFloat(getVal(row, 'Power volt')) || undefined;
    e.integralRatio = parseFloat(getVal(row, 'Integral ratio')) || undefined;
    e.resetSource = getVal(row, 'Reset source');
    e.wakeupSignal = getVal(row, 'Wake-up signal');
    e.accVoltage = parseFloat(getVal(row, 'Acc. voltage')) || undefined;

    // High voltage measurements
    e.hvbpos = parseFloat(getVal(row, 'HVBPOS')) || undefined;
    e.hv1 = parseFloat(getVal(row, 'HV1')) || undefined;
    e.hv2 = parseFloat(getVal(row, 'HV2')) || undefined;
    e.hv3 = parseFloat(getVal(row, 'HV3')) || undefined;
    e.hv4 = parseFloat(getVal(row, 'HV4')) || undefined;
    e.hv5 = parseFloat(getVal(row, 'HV5')) || undefined;

    // Fault flags
    e.chgSelfDiagFault = getVal(row, 'Chg Self-Diag Fault');
    e.dchgSelfDiagFault = getVal(row, 'Dchg Self-Diag Fault');
    e.chgDiagFault = getVal(row, 'Chg Diag. Fault Flag');
    e.dchgDiagFault = getVal(row, 'Dchg Diag. Fault Flag');

    // Parse relay states - ensure all 6 relays are initialized
    for (let j = 0; j < ALL_RELAYS.length; j++) {
      e.relays[ALL_RELAYS[j]] = 'OFF'; // Default to OFF
    }

    // Parse relay states - Excel has "Relay 0" with space, not "Relay0"
    const sysKeys = Object.keys(row);
    for (let j = 0; j < sysKeys.length; j++) {
      const k = sysKeys[j];
      const cleaned = cleanKey(k);
      const m = cleaned.match(/^Relay\s*(\d+)$/i);
      if (m) {
        const relayNum = m[1];
        const relayId = `Relay${relayNum}`;  // Store as Relay0, Relay1, etc.
        const val = row[k];
        // Excel uses 'Close'/'Open'/'Sticking' not 'ON'/'OFF'
        if (val === 'Close' || val === 'ON' || val === '1' || val === 1) {
          e.relays[relayId] = 'ON';
        } else if (val === 'Sticking') {
          e.relays[relayId] = 'STICKING';
        } else {
          e.relays[relayId] = 'OFF';
        }
      }
    }
  }

  // Process CELL BALANCING - Use for loop instead of forEach to avoid stack overflow
  for (let i = 0; i < balancing.length; i++) {
    const row = balancing[i];
    const t = parseDate(getVal(row, 'Time'));
    if (!t) continue;
    const ts = t.getTime();

    if (!dataMap.has(ts)) {
      dataMap.set(ts, { time: t, ts, cells: {}, relays: {}, balancing: {} });
    }
    const e = dataMap.get(ts);
    e.balancing = e.balancing || {};

    // Parse balancing states for each cell
    const balKeys = Object.keys(row);
    for (let j = 0; j < balKeys.length; j++) {
      const k = balKeys[j];
      const m = cleanKey(k).match(/Balancing\s+state\s+(\d+)/i);
      if (m) {
        const cellNum = parseInt(m[1]);
        const val = row[k];
        e.balancing[cellNum] = val === 'Balance' ? 'ACTIVE' : 'OFF';
      }
    }
  }

  // Process ENERGY DATA - Use for loop instead of forEach to avoid stack overflow
  for (let i = 0; i < energy.length; i++) {
    const row = energy[i];
    const t = parseDate(getVal(row, 'Time'));
    if (!t) continue;
    const ts = t.getTime();

    if (!dataMap.has(ts)) {
      dataMap.set(ts, { time: t, ts, cells: {}, relays: {} });
    }
    const e = dataMap.get(ts);

    e.chargedEnergy = parseFloat(getVal(row, 'This time charged energy')) || undefined;
    e.accChargedEnergy = parseFloat(getVal(row, 'Acc. charged energy')) || undefined;
    e.dischargedEnergy = parseFloat(getVal(row, 'This time discharged energy')) || undefined;
    e.accDischargedEnergy = parseFloat(getVal(row, 'Acc. discharged energy')) || undefined;
  }

  // Process CHARGING DATA - Use for loop instead of forEach to avoid stack overflow
  for (let i = 0; i < charging.length; i++) {
    const row = charging[i];
    const t = parseDate(getVal(row, 'Time'));
    if (!t) continue;
    const ts = t.getTime();

    if (!dataMap.has(ts)) {
      dataMap.set(ts, { time: t, ts, cells: {}, relays: {} });
    }
    const e = dataMap.get(ts);

    e.chargerConnected = getVal(row, 'Charger conn.');
    e.chargingTime = getVal(row, 'Charging elapsed time');
    e.chargeReqVolt = parseFloat(getVal(row, 'Charge Req. Volt.')) || undefined;
    e.chargeReqCurr = parseFloat(getVal(row, 'Charge Req. Curr.')) || undefined;
    e.chargerOutputVolt = parseFloat(getVal(row, 'Charger Output Volt.')) || undefined;
    e.chargerOutputCurr = parseFloat(getVal(row, 'Charger Output Curr.')) || undefined;
    e.chargerFaultStat = getVal(row, 'Charger fault stat.');
    e.chargerPortTemp1 = parseFloat(getVal(row, 'Charger port temp.01')) || undefined;
    e.chargerPortTemp2 = parseFloat(getVal(row, 'Charger port temp.02')) || undefined;
    e.chargerPortTemp3 = parseFloat(getVal(row, 'Charger port temp.03')) || undefined;
  }

  // ====================================================================
  // ENHANCED Z-SCORE OUTLIER DETECTION FOR CELL VOLTAGES
  // ====================================================================
  // Statistical method for early detection of weak/failing cells
  //
  // Z-Score measures how many standard deviations a cell voltage deviates
  // from the pack mean. Higher Z-scores indicate statistical anomalies.
  //
  // 4-LEVEL DETECTION SYSTEM:
  // ┌──────────┬─────────────┬─────────────────┬────────────────────┐
  // │ Z-Score  │ Confidence  │ Classification  │ Action Required    │
  // ├──────────┼─────────────┼─────────────────┼────────────────────┤
  // │ <1.5     │ <86.6%      │ Normal variance │ No action          │
  // │ 1.5-2.0  │ 86.6-95%    │ Early warning   │ Monitor trend      │
  // │ 2.0-3.0  │ 95-99.7%    │ Unusual cell    │ Flag, investigate  │
  // │ 3.0-4.5  │ 99.7-99.99% │ Clear anomaly   │ Reduce current 50% │
  // │ >4.5     │ >99.99%     │ Definite fault  │ Critical service   │
  // └──────────┴─────────────┴─────────────────┴────────────────────┘
  //
  // Benefits over absolute thresholds:
  // - Detects relative weakness between cells (e.g., one cell drifting)
  // - Works across all SOC levels (accounts for natural voltage variation)
  // - Catches early degradation before absolute limits are violated
  // - Adapts to pack-specific characteristics automatically
  //
  // Example: A pack at 3300mV average with one cell at 3250mV (50mV lower)
  // might have Z-score = 2.5 if standard deviation is 20mV, triggering
  // an "unusual cell" alert even though 3250mV is within absolute limits.
  // ====================================================================

  // ====================================================================
  // PRODUCT DETECTION & VALIDATION
  // Detect product based on cell count and validate pack voltage consistency
  // This MUST come before product-spec validation code
  // ====================================================================
  let detectedProduct = null;
  let productSpec = null;
  let configMismatch = false;

  // Compute entries array once and reuse throughout (avoids repeated Array.from calls)
  const entriesArray = Array.from(dataMap.values());
  const firstEntry = entriesArray[0];
  if (firstEntry) {
    const cellCount = Object.keys(firstEntry.cells).length;
    const avgPackVoltage = firstEntry.packVoltage || 0;

    // Detect product
    const detection = detectProduct(cellCount, avgPackVoltage);
    if (detection) {
      detectedProduct = detection.key;
      productSpec = detection.spec;

      // VALIDATION: Check for series count misconfiguration
      // Compute average cell voltage from individual cells
      const cellVoltages = Object.values(firstEntry.cells).filter(v => v != null && v > 1000 && v < 5000);
      if (cellVoltages.length > 0 && firstEntry.packVoltage) {
        const avgCellVoltage = cellVoltages.reduce((sum, v) => sum + v, 0) / cellVoltages.length;
        // Expected pack voltage = average cell voltage (mV) × series cell count / 1000
        const expectedPackVoltage = (avgCellVoltage * productSpec.seriesCellCount) / 1000;
        const voltageDifference = Math.abs(expectedPackVoltage - firstEntry.packVoltage);
        const tolerance = firstEntry.packVoltage * 0.05; // 5% tolerance

        if (voltageDifference > tolerance) {
          configMismatch = true;
          detectedAnomalies.push({
            type: 'config_mismatch',
            time: firstEntry.time,
            timeStr: firstEntry.time.toLocaleString(),
            description: `CONFIGURATION MISMATCH: Expected pack voltage ${expectedPackVoltage.toFixed(1)}V (avg cell ${avgCellVoltage.toFixed(0)}mV × ${productSpec.seriesCellCount} series cells) but log shows ${firstEntry.packVoltage.toFixed(1)}V. Difference: ${voltageDifference.toFixed(1)}V. Series cell count may be incorrect. Do not trust derived per-cell thresholds.`,
            cells: [],
            severity: 3
          });
        }
      }
    }
  }

  // Legacy fallback for old threshold system
  let packSystem = null;
  if (productSpec) {
    packSystem = productSpec.seriesCellCount === 24 ? '80V' : '96V';
  }

  // ====================================================================
  // PRODUCT-SPEC BASED PER-CELL VOLTAGE VALIDATION WITH HYSTERESIS
  // Check each cell against product-specific absolute limits
  // Derived from pack limits divided by series cell count (NOT total cells)
  //
  // HYSTERESIS DEADBAND: ±50mV tolerance to prevent false alarms from:
  // - Normal charger CC/CV overshoot (30-100mV typical during transition)
  // - Cell voltage monitor accuracy (±10-15mV)
  // - Temperature-dependent voltage variation (±30-40mV)
  // - Current-dependent IR drop (±20-30mV)
  //
  // Example: 3550mV spec with 50mV hysteresis → only flag if >3600mV or <2450mV
  // This filters trivial 32mV overshoot while catching real problems at 100+ mV
  // ====================================================================
  if (productSpec && !configMismatch) {
    const HYSTERESIS_MV = 50; // Industry-standard deadband for charger overshoot tolerance

    // Only apply product-specific validation if we have valid product detection
    for (const [ts, e] of dataMap) {
      const cellEntries = Object.entries(e.cells);
      for (let i = 0; i < cellEntries.length; i++) {
        const [cellIdx, voltage] = cellEntries[i];
        if (voltage == null || voltage < 1000 || voltage > 5000) continue;

        // CRITICAL UNDERVOLTAGE: Below minimum with hysteresis (e.g., <2450mV for 2500mV spec)
        if (voltage < (productSpec.cellVoltage.min - HYSTERESIS_MV)) {
          detectedAnomalies.push({
            type: 'cell_voltage_spec',
            time: e.time,
            timeStr: e.time.toLocaleString(),
            description: `CRITICAL UNDERVOLTAGE - Cell #${cellIdx}: ${voltage}mV is ${(productSpec.cellVoltage.min - voltage).toFixed(0)}mV below minimum spec (${productSpec.cellVoltage.min}mV) for ${productSpec.name} - Over-discharge damage risk`,
            cells: [{ cell: cellIdx, voltage, min: productSpec.cellVoltage.min, max: productSpec.cellVoltage.max }],
            severity: 3
          });
        }
        // CRITICAL OVERVOLTAGE: Above maximum with hysteresis (e.g., >3600mV for 3550mV spec)
        // Filters normal 30-50mV charger overshoot; only flags sustained over-charging
        else if (voltage > (productSpec.cellVoltage.max + HYSTERESIS_MV)) {
          detectedAnomalies.push({
            type: 'cell_voltage_spec',
            time: e.time,
            timeStr: e.time.toLocaleString(),
            description: `CRITICAL OVERVOLTAGE - Cell #${cellIdx}: ${voltage}mV is ${(voltage - productSpec.cellVoltage.max).toFixed(0)}mV above maximum spec (${productSpec.cellVoltage.max}mV) for ${productSpec.name} - Sustained overcharge detected (exceeds ${HYSTERESIS_MV}mV hysteresis deadband)`,
            cells: [{ cell: cellIdx, voltage, min: productSpec.cellVoltage.min, max: productSpec.cellVoltage.max }],
            severity: 3
          });
        }
      }
    }
  }

  for (const [ts, e] of dataMap) {
    const cellVoltages = Object.values(e.cells).filter(v => v != null && v > 1000 && v < 5000);

    if (cellVoltages.length >= 3) {  // Need at least 3 cells for meaningful statistics
      // Calculate mean
      const mean = cellVoltages.reduce((sum, v) => sum + v, 0) / cellVoltages.length;

      // Calculate standard deviation
      const variance = cellVoltages.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / cellVoltages.length;
      const stdDev = Math.sqrt(variance);

      // HYBRID Z-SCORE + ABSOLUTE VOLTAGE THRESHOLD DETECTION
      // Industry-calibrated thresholds based on real-world battery tolerances:
      // - <20mV: Manufacturing noise (ignore)
      // - 20-50mV: Normal operation (no action)
      // - 50-100mV: Expected variance (monitor trends only, no alerts)
      // - 100-200mV: Early imbalance (begin logging)
      // - 200-300mV: Degradation indicator (warning)
      // - 300+mV: Dangerous imbalance (fault alarm)
      //
      // Uses hybrid approach: Alert only if BOTH statistical (Z-score) AND physical (absolute voltage) thresholds are met
      const cellEntries2 = Object.entries(e.cells);
      for (let i = 0; i < cellEntries2.length; i++) {
        const [cellIdx, voltage] = cellEntries2[i];
        if (voltage == null || voltage < 1000 || voltage > 5000) continue;

        const zScore = Math.abs((voltage - mean) / stdDev);
        const deviation = voltage - mean;
        const absDeviation = Math.abs(deviation);
        const direction = deviation > 0 ? 'higher' : 'lower';

        // CRITICAL: Only flag if deviation exceeds physical thresholds (prevents false positives on tight packs)

        // Level 4: Dangerous imbalance - |Delta| > 300mV OR (|Delta| > 200mV AND Z > 4.5)
        if (absDeviation > 300 || (absDeviation > 200 && zScore > 4.5)) {
          detectedAnomalies.push({
            type: 'voltage_outlier',
            time: e.time,
            timeStr: e.time.toLocaleString(),
            description: `CRITICAL FAULT - Cell #${cellIdx}: ${voltage}mV (${absDeviation.toFixed(0)}mV ${direction} than pack mean) | Z-score: ${zScore.toFixed(2)} - DANGEROUS IMBALANCE - Immediate service required`,
            cells: [{ cell: cellIdx, voltage, zScore: zScore.toFixed(2), deviation: deviation.toFixed(0), mean: mean.toFixed(0) }],
            severity: 3
          });
        }
        // Level 3: Degradation indicator - |Delta| > 200mV AND Z > 3.0
        else if (absDeviation > 200 && zScore > 3.0) {
          detectedAnomalies.push({
            type: 'voltage_outlier',
            time: e.time,
            timeStr: e.time.toLocaleString(),
            description: `DEGRADATION INDICATOR - Cell #${cellIdx}: ${voltage}mV (${absDeviation.toFixed(0)}mV ${direction} than pack mean) | Z-score: ${zScore.toFixed(2)} - Investigate cell health, reduce current 50%`,
            cells: [{ cell: cellIdx, voltage, zScore: zScore.toFixed(2), deviation: deviation.toFixed(0), mean: mean.toFixed(0) }],
            severity: 3
          });
        }
        // Level 2: Early imbalance - |Delta| > 100mV AND Z > 2.5
        else if (absDeviation > 100 && zScore > 2.5) {
          detectedAnomalies.push({
            type: 'voltage_outlier',
            time: e.time,
            timeStr: e.time.toLocaleString(),
            description: `EARLY IMBALANCE - Cell #${cellIdx}: ${voltage}mV (${absDeviation.toFixed(0)}mV ${direction} than pack mean) | Z-score: ${zScore.toFixed(2)} - Begin logging, monitor closely`,
            cells: [{ cell: cellIdx, voltage, zScore: zScore.toFixed(2), deviation: deviation.toFixed(0), mean: mean.toFixed(0) }],
            severity: 2
          });
        }
        // Level 1: Monitor trend - |Delta| > 80mV AND Z > 2.0 (only for sustained deviations)
        else if (absDeviation > 80 && zScore > 2.0) {
          detectedAnomalies.push({
            type: 'voltage_outlier',
            time: e.time,
            timeStr: e.time.toLocaleString(),
            description: `Monitor Trend - Cell #${cellIdx}: ${voltage}mV (${absDeviation.toFixed(0)}mV ${direction} than pack mean) | Z-score: ${zScore.toFixed(2)} - Monitor for developing pattern`,
            cells: [{ cell: cellIdx, voltage, zScore: zScore.toFixed(2), deviation: deviation.toFixed(0), mean: mean.toFixed(0) }],
            severity: 1
          });
        }
        // Below 80mV: Normal operation - no alerts (filters out 4mV false positives)
      }
    }
  }

  // ====================================================================
  // PSI-COMPLIANT ANOMALY DETECTION - v2.0
  // Three-level system aligned with PSI fault response hierarchy
  // ====================================================================

  // Track level 2 faults for compound detection
  let activeLevel2Faults = [];

  for (const [ts, e] of dataMap) {
    const charging = isCharging(e.current, e.systemState);
    const discharging = isDischarging(e.current, e.systemState);
    activeLevel2Faults = []; // Reset per timestamp

    // ================================================================
    // DATA VALIDATION - Check for sensor faults before processing
    // ================================================================
    const validationIssues = validateDataPoint(e, THRESHOLDS);
    for (const issue of validationIssues) {
      detectedAnomalies.push({
        type: issue.type,
        time: e.time,
        timeStr: e.time.toLocaleString(),
        description: `DATA VALIDATION: ${issue.message}`,
        cells: [],
        severity: 3
      });
    }

    // ================================================================
    // PACK VOLTAGE MONITORING - PSI 3-level system
    // ================================================================
    if (e.packVoltage != null) {
      const pvThresh = packSystem === '96V' ? THRESHOLDS.packVoltage96V : THRESHOLDS.packVoltage80V;

      // Level 3 - Critical
      if (e.packVoltage <= pvThresh.level3Low) {
        detectedAnomalies.push({
          type: 'pack_voltage',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 3 CRITICAL: Pack voltage ${e.packVoltage.toFixed(1)}V ≤${pvThresh.level3Low}V - Severe over-discharge, copper plating risk, OPEN RELAY`,
          cells: [],
          severity: 3
        });
      } else if (e.packVoltage >= pvThresh.level3High) {
        detectedAnomalies.push({
          type: 'pack_voltage',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 3 CRITICAL: Pack voltage ${e.packVoltage.toFixed(1)}V ≥${pvThresh.level3High}V - Electrolyte breakdown risk, SHUTDOWN`,
          cells: [],
          severity: 3
        });
      }
      // Level 2 - Warning
      else if (e.packVoltage <= pvThresh.level2Low) {
        detectedAnomalies.push({
          type: 'pack_voltage',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 2 WARNING: Pack voltage ${e.packVoltage.toFixed(1)}V at discharge cutoff (0% SOC) - Terminate discharge`,
          cells: [],
          severity: 2
        });
        activeLevel2Faults.push('pack_voltage_low');
      } else if (e.packVoltage >= pvThresh.level2High) {
        detectedAnomalies.push({
          type: 'pack_voltage',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 2 WARNING: Pack voltage ${e.packVoltage.toFixed(1)}V >3.6V/cell - STOP CHARGING, accelerated degradation`,
          cells: [],
          severity: 2
        });
        activeLevel2Faults.push('pack_voltage_high');
      }
      // Level 1 - Informational
      else if (e.packVoltage <= pvThresh.level1Low) {
        detectedAnomalies.push({
          type: 'pack_voltage',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 1 INFO: Pack voltage ${e.packVoltage.toFixed(1)}V - Low SOC, recharge soon`,
          cells: [],
          severity: 1
        });
      } else if (e.packVoltage >= pvThresh.level1High) {
        detectedAnomalies.push({
          type: 'pack_voltage',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 1 INFO: Pack voltage ${e.packVoltage.toFixed(1)}V - Approaching full charge`,
          cells: [],
          severity: 1
        });
      }
    }

    // ================================================================
    // TEMPERATURE MONITORING - Context-aware (charging vs discharging)
    // ================================================================
    if (e.maxTemp != null) {
      const tempThresh = charging ? THRESHOLDS.tempCharging : THRESHOLDS.tempDischarging;

      // COMPOUND FAULT: Low temp + Charging = ALWAYS Level 3
      if (charging && e.maxTemp < COMPOUND_FAULTS.lowTempCharging.tempThreshold) {
        detectedAnomalies.push({
          type: 'compound_fault',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 3 COMPOUND FAULT: Charging at ${e.maxTemp.toFixed(1)}°C (<0°C) - LITHIUM PLATING RISK - STOP CHARGING IMMEDIATELY`,
          cells: [],
          severity: 3
        });
      }
      // Level 3 - Critical temperature
      else if (e.maxTemp <= tempThresh.level3Low) {
        detectedAnomalies.push({
          type: 'temperature',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 3 CRITICAL: Temperature ${e.maxTemp.toFixed(1)}°C ≤${tempThresh.level3Low}°C - ${charging ? 'STOP CHARGING' : 'CUT OFF DISCHARGE'}`,
          cells: [],
          severity: 3
        });
      } else if (e.maxTemp >= tempThresh.level3High) {
        detectedAnomalies.push({
          type: 'temperature',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 3 CRITICAL: Temperature ${e.maxTemp.toFixed(1)}°C ≥${tempThresh.level3High}°C - THERMAL RUNAWAY RISK - ${charging ? 'STOP CHARGING' : 'CUT OFF DISCHARGE'}`,
          cells: [],
          severity: 3
        });
      }
      // Level 2 - Warning
      else if (e.maxTemp <= tempThresh.level2Low) {
        detectedAnomalies.push({
          type: 'temperature',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 2 WARNING: Temperature ${e.maxTemp.toFixed(1)}°C - ${charging ? 'Risk of lithium plating, pause charging' : 'Limit discharge current'}`,
          cells: [],
          severity: 2
        });
        activeLevel2Faults.push('temperature_low');
      } else if (e.maxTemp >= tempThresh.level2High) {
        detectedAnomalies.push({
          type: 'temperature',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 2 WARNING: Temperature ${e.maxTemp.toFixed(1)}°C - ${charging ? 'Reduce current, activate cooling' : 'Limit discharge current, alert operator'}`,
          cells: [],
          severity: 2
        });
        activeLevel2Faults.push('temperature_high');
      }
      // Level 1 - Informational
      else if (e.maxTemp <= tempThresh.level1Low) {
        detectedAnomalies.push({
          type: 'temperature',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 1 INFO: Temperature ${e.maxTemp.toFixed(1)}°C - ${charging ? 'At minimum safe charging temp' : 'Reduced performance expected'}`,
          cells: [],
          severity: 1
        });
      } else if (e.maxTemp >= tempThresh.level1High) {
        detectedAnomalies.push({
          type: 'temperature',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 1 INFO: Temperature ${e.maxTemp.toFixed(1)}°C - Approaching limit, prepare thermal management`,
          cells: [],
          severity: 1
        });
      }
    }

    // ================================================================
    // TEMPERATURE SPREAD (IMBALANCE)
    // ================================================================
    if (e.tempDiff != null) {
      if (e.tempDiff > THRESHOLDS.tempDiff.level3) {
        detectedAnomalies.push({
          type: 'temp_imbalance',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 3 CRITICAL: Temperature spread ${e.tempDiff.toFixed(1)}°C (>${THRESHOLDS.tempDiff.level3}°C) - Cell defect or contact resistance`,
          cells: [],
          severity: 3
        });
      } else if (e.tempDiff > THRESHOLDS.tempDiff.level2) {
        detectedAnomalies.push({
          type: 'temp_imbalance',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 2 WARNING: Temperature spread ${e.tempDiff.toFixed(1)}°C - Investigate heat distribution, check airflow`,
          cells: [],
          severity: 2
        });
        activeLevel2Faults.push('temp_imbalance');
      } else if (e.tempDiff > THRESHOLDS.tempDiff.level1) {
        detectedAnomalies.push({
          type: 'temp_imbalance',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 1 INFO: Temperature spread ${e.tempDiff.toFixed(1)}°C - Monitor trends`,
          cells: [],
          severity: 1
        });
      }
    }

    // ================================================================
    // CELL VOLTAGE DELTA (IMBALANCE) - PSI 3-level system
    // ================================================================
    if (e.cellDiff != null) {
      // COMPOUND FAULT: High delta + Low SOC = Level 3
      if (e.cellDiff > COMPOUND_FAULTS.highDeltaLowSoc.deltaThreshold &&
          e.soc != null && e.soc < COMPOUND_FAULTS.highDeltaLowSoc.socThreshold) {
        detectedAnomalies.push({
          type: 'compound_fault',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 3 COMPOUND FAULT: Cell imbalance ${e.cellDiff}mV + Low SOC ${e.soc?.toFixed(1)}% - HIGH RISK OF CELL REVERSAL`,
          cells: [],
          severity: 3
        });
      }
      // Level 3 - Critical imbalance
      else if (e.cellDiff > THRESHOLDS.cellDelta.level3) {
        detectedAnomalies.push({
          type: 'cell_imbalance',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 3 CRITICAL: Cell imbalance ${e.cellDiff}mV (>${THRESHOLDS.cellDelta.level3}mV) - Bad cell or connection, risk of reversal`,
          cells: [],
          severity: 3
        });
      }
      // Level 2 - Warning
      else if (e.cellDiff > THRESHOLDS.cellDelta.level2) {
        detectedAnomalies.push({
          type: 'cell_imbalance',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 2 WARNING: Cell imbalance ${e.cellDiff}mV - Weak cell suspected, limit depth of discharge`,
          cells: [],
          severity: 2
        });
        activeLevel2Faults.push('cell_imbalance');
      }
      // Level 1 - Informational
      else if (e.cellDiff > THRESHOLDS.cellDelta.level1) {
        detectedAnomalies.push({
          type: 'cell_imbalance',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 1 INFO: Cell imbalance ${e.cellDiff}mV - Minor, BMS balancing should correct`,
          cells: [],
          severity: 1
        });
      }
    }

    // ================================================================
    // INSULATION RESISTANCE - PSI 3-level system
    // ================================================================
    if (e.insulationRes != null && e.insulationRes < THRESHOLDS.insulation.open) {
      if (e.insulationRes <= THRESHOLDS.insulation.level3) {
        detectedAnomalies.push({
          type: 'insulation',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 3 CRITICAL: Insulation ${formatInsulation(e.insulationRes)} (≤200kΩ) - Severe failure, OPEN MAIN RELAY`,
          cells: [],
          severity: 3
        });
      } else if (e.insulationRes <= THRESHOLDS.insulation.level2) {
        detectedAnomalies.push({
          type: 'insulation',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 2 WARNING: Insulation ${formatInsulation(e.insulationRes)} (≤500kΩ) - Significant loss, REDUCE POWER 50%`,
          cells: [],
          severity: 2
        });
        activeLevel2Faults.push('insulation');
      } else if (e.insulationRes <= THRESHOLDS.insulation.level1) {
        detectedAnomalies.push({
          type: 'insulation',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 1 INFO: Insulation ${formatInsulation(e.insulationRes)} (<2MΩ) - Slight reduction, inspect for moisture`,
          cells: [],
          severity: 1
        });
      }
    }

    // ================================================================
    // STATE OF CHARGE (SOC) - PSI 3-level system
    // ================================================================
    if (e.soc != null) {
      // Data validation - SOC outside 0-100%
      if (e.soc < THRESHOLDS.soc.validMin || e.soc > THRESHOLDS.soc.validMax) {
        detectedAnomalies.push({
          type: 'soc_data_fault',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 3 DATA FAULT: SOC ${e.soc.toFixed(1)}% outside valid range 0-100% - Sensor/calibration fault`,
          cells: [],
          severity: 3
        });
      }
      // Level 2 - Critically low
      else if (e.soc <= THRESHOLDS.soc.level2Low) {
        detectedAnomalies.push({
          type: 'soc',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 2 WARNING: SOC ${e.soc.toFixed(1)}% (≤${THRESHOLDS.soc.level2Low}%) - Critically low, restrict power, stop operation`,
          cells: [],
          severity: 2
        });
        activeLevel2Faults.push('soc_low');
      }
      // Level 1 - Low battery warning
      else if (e.soc < THRESHOLDS.soc.level1Low) {
        detectedAnomalies.push({
          type: 'soc',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 1 INFO: SOC ${e.soc.toFixed(1)}% (<${THRESHOLDS.soc.level1Low}%) - Low battery warning, plan recharging`,
          cells: [],
          severity: 1
        });
      }
    }

    // ================================================================
    // STATE OF HEALTH (SOH) - PSI 3-level system
    // ================================================================
    if (e.soh != null) {
      if (e.soh < THRESHOLDS.soh.level3) {
        detectedAnomalies.push({
          type: 'soh',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 3 CRITICAL: SOH ${e.soh.toFixed(1)}% (<${THRESHOLDS.soh.level3}%) - Severe degradation, REMOVE FROM SERVICE`,
          cells: [],
          severity: 3
        });
      } else if (e.soh <= THRESHOLDS.soh.level2) {
        detectedAnomalies.push({
          type: 'soh',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 2 WARNING: SOH ${e.soh.toFixed(1)}% (≤${THRESHOLDS.soh.level2}%) - End-of-Life threshold, schedule replacement`,
          cells: [],
          severity: 2
        });
        activeLevel2Faults.push('soh_eol');
      } else if (e.soh <= THRESHOLDS.soh.level1) {
        detectedAnomalies.push({
          type: 'soh',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `LEVEL 1 INFO: SOH ${e.soh.toFixed(1)}% (≤${THRESHOLDS.soh.level1}%) - Moderate degradation, begin replacement planning`,
          cells: [],
          severity: 1
        });
      }
    }

    // ================================================================
    // COMPOUND FAULT: Multiple Level 2 faults = Escalate to Level 3
    // ================================================================
    if (activeLevel2Faults.length >= COMPOUND_FAULTS.multipleLevel2.count) {
      detectedAnomalies.push({
        type: 'compound_fault',
        time: e.time,
        timeStr: e.time.toLocaleString(),
        description: `LEVEL 3 COMPOUND FAULT: Multiple Level 2 conditions active (${activeLevel2Faults.join(', ')}) - Systemic issue, immediate attention required`,
        cells: [],
        severity: 3
      });
    }

    // ================================================================
    // COMPOUND FAULT: High Temp + High Current
    // ================================================================
    if (e.maxTemp != null && e.maxTemp > COMPOUND_FAULTS.highTempHighCurrent.tempThreshold &&
        productSpec?.current && e.current != null) {
      const currentPercent = Math.abs(e.current) / productSpec.current.dischargeContinuous * 100;
      if (currentPercent > COMPOUND_FAULTS.highTempHighCurrent.currentPercent) {
        detectedAnomalies.push({
          type: 'compound_fault',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `COMPOUND ESCALATION: High temp ${e.maxTemp.toFixed(1)}°C + High current ${Math.abs(e.current).toFixed(0)}A (${currentPercent.toFixed(0)}%) - Heat generation compounds, escalate severity`,
          cells: [],
          severity: 3
        });
      }
    }

    // ================================================================
    // COMPOUND FAULT: High Temp + High SOC
    // ================================================================
    if (e.maxTemp != null && e.maxTemp > COMPOUND_FAULTS.highTempHighSoc.tempThreshold &&
        e.soc != null && e.soc > COMPOUND_FAULTS.highTempHighSoc.socThreshold) {
      detectedAnomalies.push({
        type: 'compound_fault',
        time: e.time,
        timeStr: e.time.toLocaleString(),
        description: `COMPOUND ESCALATION: High temp ${e.maxTemp.toFixed(1)}°C + High SOC ${e.soc.toFixed(1)}% - Fully charged cells more vulnerable to thermal stress`,
        cells: [],
        severity: 3
      });
    }
  }

  const sorted = iterativeMergeSort(entriesArray, (a, b) => a.ts - b.ts);
  if (DEBUG) console.log('Time series:', sorted.length, 'entries');
  if (DEBUG) console.log('Anomalies detected:', detectedAnomalies.length);

  // Process FAULTS - Use for loop instead of forEach to avoid stack overflow
  const faults = [];
  const activeFaultState = new Map();

  // Build timestamp index for O(1) lookups (avoids O(n²) sorted.find() in loop)
  const tsIndex = new Map(sorted.map(s => [s.ts, s]));

  // Helper function to find nearest snapshot within tolerance
  const findNearestSnapshot = (targetTs, tolerance = 2000) => {
    // Try exact match first
    if (tsIndex.has(targetTs)) return tsIndex.get(targetTs);
    // Fall back to linear search within tolerance (rare case)
    for (let offset = 1; offset <= tolerance; offset++) {
      if (tsIndex.has(targetTs + offset)) return tsIndex.get(targetTs + offset);
      if (tsIndex.has(targetTs - offset)) return tsIndex.get(targetTs - offset);
    }
    return {};
  };

  for (let rowIdx = 0; rowIdx < alarms.length; rowIdx++) {
    const row = alarms[rowIdx];
    const t = parseDate(getVal(row, 'Time'));
    if (!t) continue;

    const alarmKeys = Object.keys(row);
    for (let i = 0; i < alarmKeys.length; i++) {
      const rawKey = alarmKeys[i];
      const key = cleanKey(rawKey);
      if (key === 'Time' || key === 'Alarm number') continue;

      const val = row[rawKey];
      if (typeof val !== 'string') continue;

      const trimVal = val.trim();
      const severity = SEVERITY_MAP[trimVal];
      const prevState = activeFaultState.get(key);
      const currentState = severity || 0;

      if (currentState !== (prevState?.severity || 0)) {
        if (currentState > 0) {
          const snapshot = findNearestSnapshot(t.getTime());

          // Check for sticking relays to enhance fault name
          let enhancedName = ALARM_MAPPING[key] || key;
          let stickingRelays = [];
          if (snapshot && snapshot.relays) {
            stickingRelays = Object.entries(snapshot.relays)
              .filter(([, state]) => state === 'STICKING')
              .map(([relayId]) => relayId);

            // If this is a relay fault and we found sticking relays, enhance the name
            if (key === 'RlyFault' && stickingRelays.length > 0) {
              enhancedName = `Relay Fault (${stickingRelays.join(', ')} Sticking)`;
            }
          }

          const evt = {
            id: `${key}-${t.getTime()}`,
            code: key,
            name: enhancedName,
            severity: currentState,
            severityText: trimVal,
            eventType: 'SET',
            time: t,
            timeStr: t.toLocaleString(),
            snapshot: { ...snapshot },
            stickingRelays, // Store sticking relays for reference
            stats: null // Will be calculated when fault ends
          };
          faults.push(evt);
          activeFaultState.set(key, { severity: currentState, startTime: t, event: evt });
        } else if (prevState) {
          const duration = (t.getTime() - prevState.startTime.getTime()) / 60000;
          prevState.event.endTime = t;
          prevState.event.duration = duration;

          // Calculate statistics during fault period
          const faultData = sorted.filter(s => s.ts >= prevState.startTime.getTime() && s.ts <= t.getTime());
          if (faultData.length > 0) {
            const cellVoltages = faultData.flatMap(d => Object.values(d.cells || {})).filter(v => v != null && v < 5000);
            const temps = faultData.flatMap(d => Object.entries(d).filter(([k]) => /^temp\d+$/.test(k)).map(([,v]) => v)).filter(v => v != null);
            const insulations = faultData.map(d => d.insulationRes).filter(v => v != null);
            const posInsulations = faultData.map(d => d.posInsulation).filter(v => v != null);
            const negInsulations = faultData.map(d => d.negInsulation).filter(v => v != null);

            // Helper to compute min/max/avg without spread operator (avoids stack overflow)
          const computeStats = (arr) => {
            if (!arr.length) return null;
            let min = arr[0], max = arr[0], sum = 0;
            for (let i = 0; i < arr.length; i++) {
              if (arr[i] < min) min = arr[i];
              if (arr[i] > max) max = arr[i];
              sum += arr[i];
            }
            return { min, max, avg: sum / arr.length };
          };

          prevState.event.stats = {
            cellV: computeStats(cellVoltages),
            temp: computeStats(temps),
            insulation: computeStats(insulations),
            posInsulation: computeStats(posInsulations),
            negInsulation: computeStats(negInsulations)
          };
          }

          activeFaultState.set(key, { severity: 0 });
        }
      }
    }
  }

  // Mark ongoing faults
  const lastTime = sorted[sorted.length - 1]?.time;
  for (const [key, state] of activeFaultState) {
    if (state.severity > 0 && state.event && !state.event.endTime && lastTime) {
      state.event.endTime = lastTime;
      state.event.duration = (lastTime.getTime() - state.startTime.getTime()) / 60000;
      state.event.ongoing = true;
    }
  }

  // Device info - comprehensive logging and extraction
  const dev = devInfo[0] || {};
  const devL = devList[0] || {};

  if (DEBUG) {
    console.log('=== DEVICE INFO DEBUG ===');
    console.log('Device Info sheet rows:', devInfo.length);
    console.log('Device List sheet rows:', devList.length);
    console.log('Device Info first row keys:', Object.keys(dev));
    console.log('Device List first row keys:', Object.keys(devL));
    console.log('Device Info first row:', dev);
    console.log('Device List first row:', devL);
  }

  // Check if device info is actually empty (only has Time field or Time is empty)
  const devKeys = Object.keys(dev).filter(k => k.toLowerCase() !== 'time' && k !== '﻿Time');
  const devLKeys = Object.keys(devL).filter(k => k.toLowerCase() !== 'time' && k !== '﻿Time');
  if (DEBUG) {
    console.log('Device Info has', devKeys.length, 'non-time fields');
    console.log('Device List has', devLKeys.length, 'non-time fields');
  }

  // Try all possible variations with extensive fallbacks
  const release = getVal(dev, 'releaseName', 'Release', 'release name', 'Release Name', 'Release name') ||
                  getVal(devL, 'releaseName', 'Release', 'release name', 'Release Name', 'Release name') ||
                  Object.values(dev).find(v => v && typeof v === 'string' && v.toLowerCase().includes('release'));
  const fwid = getVal(dev, 'FWID', 'Fwid', 'FW ID', 'Firmware ID', 'FirmwareID', 'Firmware_ID') ||
               getVal(devL, 'FWID', 'Fwid', 'FW ID', 'Firmware ID', 'FirmwareID', 'Firmware_ID') ||
               Object.values(dev).find(v => v && typeof v === 'string' && /^[0-9A-F]{8,}$/i.test(v)) ||
               Object.values(devL).find(v => v && typeof v === 'string' && /^[0-9A-F]{8,}$/i.test(v));
  const hwid = getVal(devL, 'Hardware Device 1 HWID', 'HWID', 'HW ID', 'Hardware ID', 'HardwareID', 'Hardware_ID') ||
               getVal(dev, 'HWID', 'HW ID', 'Hardware ID', 'HardwareID', 'Hardware_ID') ||
               Object.values(devL).find(v => v && typeof v === 'string' && /^[0-9A-F]{8,}$/i.test(v)) ||
               Object.values(dev).find(v => v && typeof v === 'string' && /^[0-9A-F]{8,}$/i.test(v));

  if (DEBUG) console.log('Extracted values:', { release, fwid, hwid });

  const deviceInfoObj = {
    release: release || '—',
    fwid: fwid || '—',
    burnId: getVal(dev, 'BurnID', 'Burn ID', 'BurnId') || '—',
    hwid: hwid || '—',
    fwVer: getVal(devL, 'Hardware Device 1 FWVerion', 'FW Version', 'FWVerion', 'Firmware Version') || '—'
  };
  if (DEBUG) console.log('Setting deviceInfo:', deviceInfoObj);

    const cellIndexRange = (minCellIndex === null || maxCellIndex === null)
      ? null
      : { min: minCellIndex, max: maxCellIndex, count: maxCellIndex - minCellIndex + 1 };

    // Dispatch all analysis state at once (avoids cross-field bugs)
  return {
    timeSeries: sorted,
    faultEvents: iterativeMergeSort(faults, (a, b) => b.time - a.time),
    anomalies: detectedAnomalies,
    deviceInfo: deviceInfoObj,
    cellIndexRange
  };
};


