import {
  ALARM_MAPPING, SEVERITY_MAP, detectProduct, ALL_RELAYS, THRESHOLDS
} from './thresholds';
import {
  cleanKey, parseDate, getVal, findSheet,
  formatInsulation, iterativeMergeSort
} from './parsers';

const DEBUG = false;

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

          // Check for anomalies using new three-level thresholds
          if (v > THRESHOLDS.cellVoltage.critical || v < THRESHOLDS.cellVoltage.bad.min) {
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

            if (v > THRESHOLDS.cellVoltage.critical || v < THRESHOLDS.cellVoltage.bad.min) {
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

    // Check for cell imbalance (voltage spread) using new three-level system
    if (e.cellDiff && e.cellDiff > THRESHOLDS.cellDiff.critical) {
      detectedAnomalies.push({
        type: 'imbalance',
        time: t,
        timeStr: t.toLocaleString(),
        rowIdx,
        description: `CRITICAL cell imbalance: ${e.cellDiff}mV spread (>150mV) - Reduce charge rate 50%, service soon`,
        cells: [],
        severity: 3
      });
    } else if (e.cellDiff && e.cellDiff > THRESHOLDS.cellDiff.marginal) {
      detectedAnomalies.push({
        type: 'imbalance',
        time: t,
        timeStr: t.toLocaleString(),
        rowIdx,
        description: `MARGINAL cell imbalance: ${e.cellDiff}mV spread (30-150mV) - Investigate weak cells, active balancing recommended`,
        cells: [],
        severity: 2
      });
    } else if (e.cellDiff && e.cellDiff > THRESHOLDS.cellDiff.good) {
      detectedAnomalies.push({
        type: 'imbalance',
        time: t,
        timeStr: t.toLocaleString(),
        rowIdx,
        description: `Cell imbalance detected: ${e.cellDiff}mV spread (>30mV) - Monitor trends`,
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

  // Additional anomaly detection pass - pack voltage, temperature, insulation, SOC, SOH
  for (const [ts, e] of dataMap) {
    // Pack voltage monitoring using product specs
    if (productSpec && !configMismatch && e.packVoltage != null) {
      // BAD: Outside published pack operating range
      if (e.packVoltage < productSpec.packVoltage.min || e.packVoltage > productSpec.packVoltage.max) {
        detectedAnomalies.push({
          type: 'pack_voltage_spec',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `PACK VOLTAGE SPEC VIOLATION: ${e.packVoltage.toFixed(1)}V is outside operating range (${productSpec.packVoltage.min}V - ${productSpec.packVoltage.max}V) for ${productSpec.name} - Immediate action required`,
          cells: [],
          severity: 3
        });
      }
    }
    // Legacy pack voltage monitoring (fallback if no product spec)
    else if (packSystem && e.packVoltage != null) {
      const thresholds = packSystem === '80V' ? THRESHOLDS.packVoltage80V : THRESHOLDS.packVoltage96V;

      if (e.packVoltage < thresholds.bad.min || e.packVoltage > thresholds.bad.max) {
        detectedAnomalies.push({
          type: 'pack_voltage',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `CRITICAL pack voltage: ${e.packVoltage.toFixed(1)}V (${packSystem} system) - Outside safe operating range, power reduction required`,
          cells: [],
          severity: 3
        });
      } else if (e.packVoltage < thresholds.marginal.min || e.packVoltage > thresholds.marginal.max) {
        detectedAnomalies.push({
          type: 'pack_voltage',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `MARGINAL pack voltage: ${e.packVoltage.toFixed(1)}V (${packSystem} system) - Check cell balance, prepare for power reduction`,
          cells: [],
          severity: 2
        });
      } else if (e.packVoltage < thresholds.good.min || e.packVoltage > thresholds.good.max) {
        detectedAnomalies.push({
          type: 'pack_voltage',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `Pack voltage outside GOOD range: ${e.packVoltage.toFixed(1)}V (${packSystem} system) - Monitor trends`,
          cells: [],
          severity: 1
        });
      }
    }

    // Temperature extremes - Three-level system
    if (e.maxTemp != null) {
      if (e.maxTemp > THRESHOLDS.temp.critical || e.maxTemp < -30) {
        detectedAnomalies.push({
          type: 'temperature',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `CRITICAL temperature: ${e.maxTemp.toFixed(1)}°C - ${e.maxTemp > 60 ? 'Emergency shutdown risk' : 'Extremely low'}`,
          cells: [],
          severity: 3
        });
      } else if (e.maxTemp > THRESHOLDS.temp.badHigh) {
        detectedAnomalies.push({
          type: 'temperature',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `BAD temperature: ${e.maxTemp.toFixed(1)}°C (>50°C) - Thermal runaway risk, reduce current 75%`,
          cells: [],
          severity: 3
        });
      } else if (e.maxTemp < THRESHOLDS.temp.badLow) {
        detectedAnomalies.push({
          type: 'temperature',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `BAD temperature: ${e.maxTemp.toFixed(1)}°C (<5°C) - Risk of plating, heat before charging`,
          cells: [],
          severity: 2
        });
      } else if (e.maxTemp > THRESHOLDS.temp.marginalHigh.min && e.maxTemp <= THRESHOLDS.temp.marginalHigh.max) {
        detectedAnomalies.push({
          type: 'temperature',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `MARGINAL temperature: ${e.maxTemp.toFixed(1)}°C (40-50°C) - Prepare cooling if >45°C`,
          cells: [],
          severity: 1
        });
      } else if (e.maxTemp >= THRESHOLDS.temp.marginalLow.min && e.maxTemp < THRESHOLDS.temp.marginalLow.max) {
        detectedAnomalies.push({
          type: 'temperature',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `MARGINAL temperature: ${e.maxTemp.toFixed(1)}°C (5-15°C) - Suboptimal, reduce current if <10°C`,
          cells: [],
          severity: 1
        });
      }
    }

    // Temperature spread (imbalance)
    if (e.tempDiff != null) {
      if (e.tempDiff > THRESHOLDS.tempDiff.critical) {
        detectedAnomalies.push({
          type: 'temp_imbalance',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `CRITICAL temperature spread: ${e.tempDiff.toFixed(1)}°C (>10°C) - Cell defect or contact resistance, isolate hot module`,
          cells: [],
          severity: 3
        });
      } else if (e.tempDiff > THRESHOLDS.tempDiff.marginal) {
        detectedAnomalies.push({
          type: 'temp_imbalance',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `MARGINAL temperature spread: ${e.tempDiff.toFixed(1)}°C (5-10°C) - Investigate heat distribution, check airflow`,
          cells: [],
          severity: 2
        });
      } else if (e.tempDiff > THRESHOLDS.tempDiff.good) {
        detectedAnomalies.push({
          type: 'temp_imbalance',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `Temperature spread detected: ${e.tempDiff.toFixed(1)}°C (>5°C) - Monitor trends`,
          cells: [],
          severity: 1
        });
      }
    }

    // Insulation resistance - Three-level system (CORRECTED per PSI spec: ≥20MΩ minimum)
    if (e.insulationRes != null && e.insulationRes < THRESHOLDS.insulation.open) {
      if (e.insulationRes < THRESHOLDS.insulation.bad) {
        detectedAnomalies.push({
          type: 'insulation',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `BAD insulation: ${formatInsulation(e.insulationRes)} (<20MΩ) - BELOW PSI MINIMUM SPEC - Immediate corrective action required`,
          cells: [],
          severity: 3
        });
      } else if (e.insulationRes < THRESHOLDS.insulation.marginal) {
        detectedAnomalies.push({
          type: 'insulation',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `MARGINAL insulation: ${formatInsulation(e.insulationRes)} (20-50MΩ) - Meets spec but trending down, investigate moisture/corrosion`,
          cells: [],
          severity: 2
        });
      } else if (e.insulationRes < THRESHOLDS.insulation.good) {
        detectedAnomalies.push({
          type: 'insulation',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `Insulation below optimal: ${formatInsulation(e.insulationRes)} (50MΩ is optimal) - Monitor for degradation trends`,
          cells: [],
          severity: 1
        });
      }
    }

    // SOC monitoring
    if (e.soc != null) {
      if (e.soc > THRESHOLDS.soc.badHigh) {
        // BAD: >105% - Firmware error
        detectedAnomalies.push({
          type: 'soc',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `SOC FIRMWARE ERROR: ${e.soc.toFixed(1)}% (>105%) - BMS firmware error, STOP and investigate`,
          cells: [],
          severity: 3
        });
      } else if (e.soc < THRESHOLDS.soc.badLow) {
        // BAD: <5% - Over-discharge risk
        detectedAnomalies.push({
          type: 'soc',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `SOC CRITICAL LOW: ${e.soc.toFixed(1)}% (<5%) - Over-discharge risk, investigate BMS discharge cutoff`,
          cells: [],
          severity: 3
        });
      } else if (e.soc > THRESHOLDS.soc.good.max && e.soc <= THRESHOLDS.soc.marginalHigh.max) {
        // MARGINAL: 100-105% - Coulomb counting drift (only flag if OVER 100%)
        detectedAnomalies.push({
          type: 'soc',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `SOC DRIFT: ${e.soc.toFixed(1)}% (100-105%) - Coulomb counting drift or measurement error, monitor and prepare recalibration`,
          cells: [],
          severity: 2
        });
      }
      // GOOD: 5-100% - No anomaly flagged (100% is normal full charge)
    }

    // SOH monitoring
    if (e.soh != null) {
      if (e.soh < THRESHOLDS.soh.eol) {
        detectedAnomalies.push({
          type: 'soh',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `SOH END OF LIFE: ${e.soh.toFixed(1)}% (<60%) - Replacement immediate, not operational`,
          cells: [],
          severity: 3
        });
      } else if (e.soh < THRESHOLDS.soh.badLevel2) {
        detectedAnomalies.push({
          type: 'soh',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `SOH CRITICAL: ${e.soh.toFixed(1)}% (60-70%) - Critical replacement window, emergency mode`,
          cells: [],
          severity: 3
        });
      } else if (e.soh < THRESHOLDS.soh.badLevel1) {
        detectedAnomalies.push({
          type: 'soh',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `SOH BAD: ${e.soh.toFixed(1)}% (70-80%) - Schedule replacement soon, 50% power derating`,
          cells: [],
          severity: 2
        });
      } else if (e.soh < THRESHOLDS.soh.marginal) {
        detectedAnomalies.push({
          type: 'soh',
          time: e.time,
          timeStr: e.time.toLocaleString(),
          description: `SOH MARGINAL: ${e.soh.toFixed(1)}% (80-90%) - Begin replacement planning, monitor closely`,
          cells: [],
          severity: 1
        });
      }
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

            prevState.event.stats = {
              cellV: cellVoltages.length ? {
                min: Math.min(...cellVoltages),
                max: Math.max(...cellVoltages),
                avg: cellVoltages.reduce((a, b) => a + b, 0) / cellVoltages.length
              } : null,
              temp: temps.length ? {
                min: Math.min(...temps),
                max: Math.max(...temps),
                avg: temps.reduce((a, b) => a + b, 0) / temps.length
              } : null,
              insulation: insulations.length ? {
                min: Math.min(...insulations),
                max: Math.max(...insulations),
                avg: insulations.reduce((a, b) => a + b, 0) / insulations.length
              } : null,
              posInsulation: posInsulations.length ? {
                min: Math.min(...posInsulations),
                max: Math.max(...posInsulations),
                avg: posInsulations.reduce((a, b) => a + b, 0) / posInsulations.length
              } : null,
              negInsulation: negInsulations.length ? {
                min: Math.min(...negInsulations),
                max: Math.max(...negInsulations),
                avg: negInsulations.reduce((a, b) => a + b, 0) / negInsulations.length
              } : null
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


