// =============================================================================
// BMS THRESHOLDS & PRODUCT SPECIFICATIONS
// PSI Li-Ion Battery Anomaly Detection Reference v2.0
// Source: PSI Li-Ion Technical Training (April 2024)
// =============================================================================

// Severity Level Definitions
// Level 1: Informational - Minor deviation, within safe margins - Log and monitor
// Level 2: Warning - Significant deviation requiring intervention - Reduce operation, alert
// Level 3: Critical - Severe safety risk or potential damage - Immediate shutdown

// Alarm code to human-readable name mapping
export const ALARM_MAPPING = {
  ChgOV: 'Charge Overvoltage', DchgOV: 'Discharge Overvoltage',
  ChgUV: 'Charge Undervoltage', DchgUV: 'Discharge Undervoltage',
  ChgPackOV: 'Charge Pack Overvoltage', DchgPackOV: 'Discharge Pack Overvoltage',
  ChgPackUV: 'Charge Pack Undervoltage', DchgPackUV: 'Discharge Pack Undervoltage',
  ChgPackVdiff: 'Charge Pack Voltage Diff', DchgPackVdiff: 'Discharge Pack Voltage Diff',
  ChgVdiff: 'Charge Voltage Diff', DchgVdiff: 'Discharge Voltage Diff',
  ChgOT: 'Charge Overtemperature', DchgOT: 'Discharge Overtemperature',
  ChgUT: 'Charge Undertemperature', DchgUT: 'Discharge Undertemperature',
  ChgTdiff: 'Charge Temp Difference', DchgTdiff: 'Discharge Temp Difference',
  DcChgOC: 'DC Charger Overcurrent', AcChgOC: 'AC Charger Overcurrent',
  FeedbackOC: 'Feedback Overcurrent', DchgContOC: 'Discharge Contactor OC',
  DchgTransOC: 'Discharge Transistor OC', HighSoc: 'High SOC', LowSoc: 'Low SOC',
  Insulation: 'Insulation Fault', PrechargeFail: 'Precharge Failure',
  ChgHeatOT: 'Charge Heater Overtemp', DchgHeatOT: 'Discharge Heater Overtemp',
  SocUnstable: 'SOC Unstable', LowSupplyPwr: 'Low Supply Power', HighSupplyPwr: 'High Supply Power',
  ChgMosOT: 'Charge MOSFET Overtemp', DcgMosOT: 'Discharge MOSFET Overtemp',
  VoltOpenWire: 'Voltage Open Wire', TempOpenWire: 'Temp Open Wire',
  InterComm: 'Internal Comm Fault', ChargerComm: 'Charger Comm Error',
  VcuComm: 'VCU Comm Error', BmsSysFault: 'BMS System Fault',
  HvilFault: 'HVIL Fault', RlyFault: 'Relay Fault', HeatFault: 'Heater Fault',
  CrashFault: 'Crash Fault', CurAbnormal: 'Current Abnormal',
  'Thermal failure': 'Thermal Failure', 'ShortCur failure': 'Short Circuit Failure'
};

export const SEVERITY_MAP = { 'Lvl 1 Alarm': 1, 'Lvl 2 Alarm': 2, 'Lvl 3 Alarm': 3 };

// ====================================================================
// PRODUCT SPECIFICATIONS - Source: PSI Product Rating Guide
// Per-cell limits are derived from pack limits divided by series cell count.
// Parallel strings (e.g., 2P24S) change capacity but DO NOT change voltage.
// Always use series cell count for voltage calculations, not total cell count.
// All models use Lithium Iron Phosphate (LiFePO₄) chemistry.
// ====================================================================
export const PRODUCT_SPECS = {
  '80V230Ah': {
    name: '80V 230Ah',
    packVoltage: { min: 60, max: 85.2 },
    cellConfig: '1P24S',
    seriesCellCount: 24,
    totalCells: 24,
    cellVoltage: { min: 2500, max: 3550 },
    capacity: 230,
    energy: 17.7, // kWh
    current: {
      dischargeContinuous: 230,
      chargeContinuous: 200,
      dischargePeak10s: 460,
      dischargePeak60s: 400,
      regenPeak10s: 400
    }
  },
  '80V304Ah': {
    name: '80V 304Ah',
    packVoltage: { min: 60, max: 85.2 },
    cellConfig: '1P24S',
    seriesCellCount: 24,
    totalCells: 24,
    cellVoltage: { min: 2500, max: 3550 },
    capacity: 304,
    energy: 23.3, // kWh
    current: {
      dischargeContinuous: 300,
      chargeContinuous: 200,
      dischargePeak10s: 600,
      dischargePeak60s: 400,
      regenPeak10s: 400
    }
  },
  '80V460Ah': {
    name: '80V 460Ah',
    packVoltage: { min: 60, max: 85.2 },
    cellConfig: '2P24S',
    seriesCellCount: 24,
    totalCells: 48,
    cellVoltage: { min: 2500, max: 3550 },
    capacity: 460,
    energy: 35.3, // kWh
    current: {
      dischargeContinuous: 400,
      chargeContinuous: 200,
      dischargePeak10s: 600,
      dischargePeak60s: 600,
      regenPeak10s: 450
    }
  },
  '96V230Ah': {
    name: '96V 230Ah',
    packVoltage: { min: 80, max: 113.6 },
    cellConfig: '1P32S',
    seriesCellCount: 32,
    totalCells: 32,
    cellVoltage: { min: 2500, max: 3550 },
    capacity: 230,
    energy: 23.6, // kWh
    current: {
      dischargeContinuous: 230,
      chargeContinuous: 200,
      dischargePeak10s: 460,
      dischargePeak60s: 400,
      regenPeak10s: 400
    }
  }
};

// Auto-detect product based on cell count and voltage range
export function detectProduct(cellCount, avgPackVoltage) {
  for (const [key, spec] of Object.entries(PRODUCT_SPECS)) {
    if (spec.totalCells === cellCount) {
      return { key, spec };
    }
  }
  if (cellCount === 24) {
    return { key: '80V230Ah', spec: PRODUCT_SPECS['80V230Ah'] };
  } else if (cellCount === 32) {
    return { key: '96V230Ah', spec: PRODUCT_SPECS['96V230Ah'] };
  }
  return null;
}

// Relay configurations by product type
// Reference: Log Relay ID to Relay Cross Reference (Section 7.6)
export const RELAY_CONFIG_BY_PRODUCT = {
  // 96V230Ah - Standard configuration with Alarm Relay
  '96V': {
    'Relay0': 'Positive Relay',
    'Relay1': 'Charging Relay',
    'Relay2': 'Heating Relay',
    'Relay3': 'Alarm Relay',
    'Relay4': 'Pre-charge Relay',
    'Relay5': 'Negative Relay'
  },
  // 80V304Ah WITHOUT 12V AUX - Has Alarm Relay, NO DC/DC Relay
  '80V': {
    'Relay0': 'Positive Relay',
    'Relay1': 'Charging Relay',
    'Relay2': 'Heating Relay',
    'Relay3': 'Alarm Relay',
    'Relay4': 'Pre-charge Relay',
    'Relay5': 'Negative Relay'
  },
  // 80V304Ah WITH 12V AUX - NO Alarm Relay, HAS DC/DC Relay
  '80V_12V_AUX': {
    'Relay0': 'Positive Relay',
    'Relay1': 'Charging Relay',
    'Relay2': 'Heating Relay',
    'Relay3': 'Pre-charge Relay',
    'Relay4': 'Negative Relay',
    'Relay5': 'DC/DC Relay'
  }
};

export const RELAY_NAMES = {
  'Relay0': 'Positive Relay',
  'Relay1': 'Charging Relay',
  'Relay2': 'Heating Relay',
  'Relay3': 'Alarm Relay',
  'Relay4': 'Pre-charge Relay',
  'Relay5': 'Negative Relay'
};

// Get relay config based on cell count and optional 12V AUX flag
export function getRelayConfig(deviceInfo, cellCount, has12VAux = false) {
  const product = detectProduct(cellCount);
  if (product?.key?.startsWith('96V')) {
    return RELAY_CONFIG_BY_PRODUCT['96V'];
  }
  if (product?.key?.startsWith('80V')) {
    return has12VAux
      ? RELAY_CONFIG_BY_PRODUCT['80V_12V_AUX']
      : RELAY_CONFIG_BY_PRODUCT['80V'];
  }
  if (cellCount >= 30) {
    return RELAY_CONFIG_BY_PRODUCT['96V'];
  }
  if (cellCount >= 24) {
    return has12VAux
      ? RELAY_CONFIG_BY_PRODUCT['80V_12V_AUX']
      : RELAY_CONFIG_BY_PRODUCT['80V'];
  }
  return RELAY_CONFIG_BY_PRODUCT['96V']; // Default fallback
}

export const ALL_RELAYS = ['Relay0', 'Relay1', 'Relay2', 'Relay3', 'Relay4', 'Relay5'];

// ====================================================================
// ANOMALY THRESHOLDS - PSI Li-Ion Battery Anomaly Detection Reference v2.0
// Three-level system aligned with PSI fault response hierarchy:
// Level 1: Informational - Log event, monitor closely
// Level 2: Warning - Reduce operation, alert operator, investigate
// Level 3: Critical - Immediate shutdown, disconnect battery, service required
// ====================================================================
export const THRESHOLDS = {
  // ====================================================================
  // CELL VOLTAGE THRESHOLDS (LiFePO₄)
  // Reference values: Min 2.5V (0% SOC), Max 3.55V (100% SOC), Absolute Max 3.65V
  // ====================================================================
  cellVoltage: {
    // Absolute safety limits (mV)
    absoluteMin: 2000,      // Cell failure threshold
    criticalLow: 2300,      // Permanent damage, copper plating
    dischargeMin: 2500,     // 0% SOC, discharge cutoff
    level1Low: 2800,        // Low SOC warning, recharge soon
    nominal: { min: 3200, max: 3400 }, // Normal operating range
    level1High: 3500,       // Approaching full charge
    chargeMax: 3550,        // 100% SOC, charge termination
    level2High: 3600,       // Stop charging, accelerated degradation
    absoluteMax: 3650,      // Critical - electrolyte breakdown risk
    sensorFault: 4000       // Impossible for LiFePO₄, sensor error
  },

  // ====================================================================
  // CELL VOLTAGE IMBALANCE (DELTA) - mV
  // Difference between highest and lowest cell voltages
  // ====================================================================
  cellDelta: {
    level1: 50,             // Minor imbalance, BMS balancing should correct
    level2: 100,            // Significant imbalance, weak cell suspected
    level3: 200,            // Critical - bad cell or connection, risk of reversal
    hysteresis: 20          // Clear threshold offset
  },

  // ====================================================================
  // PACK VOLTAGE THRESHOLDS (V)
  // ====================================================================
  packVoltage80V: {
    level1Low: 67,          // ~2.8V/cell - recharge soon
    level2Low: 60,          // ~2.5V/cell - 0% SOC cutoff
    level3Low: 55,          // ~2.3V/cell - critical damage
    level1High: 84,         // Approaching full
    level2High: 86.4,       // >3.6V/cell - stop charging
    level3High: 87.6        // ≥3.65V/cell - critical
  },
  packVoltage96V: {
    level1Low: 90,          // ~2.8V/cell
    level2Low: 80,          // ~2.5V/cell
    level3Low: 74,          // ~2.3V/cell
    level1High: 112,        // Approaching full
    level2High: 115.2,      // >3.6V/cell
    level3High: 116.8       // ≥3.65V/cell
  },

  // ====================================================================
  // TEMPERATURE THRESHOLDS (°C)
  // Different limits for charging vs discharging operations
  // ====================================================================
  tempCharging: {
    // Low temperature (lithium plating risk)
    level1Low: 0,           // Minimum safe charging temp
    level2Low: -2,          // Risk of lithium plating, pause charging
    level3Low: -5,          // STOP CHARGING - safety risk
    // High temperature
    level1High: 55,         // Approaching limit, may delay charging
    level2High: 57,         // Reduce current, activate cooling
    level3High: 60,         // STOP CHARGING - thermal runaway risk
    hysteresis: 3           // Clear threshold offset
  },
  tempDischarging: {
    // Low temperature
    level1Low: -30,         // Reduced performance
    level2Low: -32,         // Limit discharge current
    level3Low: -35,         // CUT OFF DISCHARGE
    // High temperature
    level1High: 60,         // Alert, limit heavy loads
    level2High: 62,         // Limit discharge current
    level3High: 65,         // CUT OFF DISCHARGE - thermal runaway risk
    hysteresis: 3
  },
  tempDiff: {
    level1: 5,              // Normal variance
    level2: 10,             // Investigate heat distribution
    level3: 15              // Cell defect or contact resistance
  },

  // ====================================================================
  // CURRENT THRESHOLDS
  // Model-specific - use PRODUCT_SPECS for actual limits
  // These are percentage-based for generic checks
  // ====================================================================
  current: {
    // Discharge over-current (% of continuous rating)
    level1DischargePercent: 110,    // Brief peak within spec
    level2DischargePercent: 100,    // Sustained over continuous
    // Duration thresholds (seconds)
    peakDuration10s: 10,
    peakDuration60s: 60,
    // Charge over-current
    level2ChargeExceed: true        // Any sustained over 200A continuous
  },

  // ====================================================================
  // STATE OF CHARGE (SOC) THRESHOLDS (%)
  // Operating range: 10% - 100%
  // ====================================================================
  soc: {
    level1Low: 20,          // Low battery warning, plan recharging
    level2Low: 10,          // Critically low, restrict power, stop operation
    level3Low: 0,           // Undervoltage cutoff triggered
    // Data anomalies
    validMin: 0,
    validMax: 100,
    jumpThreshold: 10,      // Sudden jump indicates sensor/calibration fault
    hysteresis: 5           // Clear threshold offset
  },

  // ====================================================================
  // STATE OF HEALTH (SOH) THRESHOLDS (%)
  // EOL defined as 80% of original capacity
  // ====================================================================
  soh: {
    level1: 90,             // Moderate degradation (~10% capacity loss)
    level2: 80,             // End-of-Life threshold, schedule replacement
    level3: 70,             // Severe degradation, remove from service
    rapidDecline: 5         // Sudden drop indicates cell failure
  },

  // ====================================================================
  // INSULATION/ISOLATION RESISTANCE THRESHOLDS (kΩ)
  // Manufacturing requirement: ≥20 MΩ at 500V DC
  // ====================================================================
  insulation: {
    excellent: 20000,       // 20 MΩ - manufacturing spec
    level1: 2000,           // ~2 MΩ - slight reduction, possible moisture
    level2: 500,            // 500 kΩ - significant loss, reduce power 50%
    level3: 200,            // 200 kΩ - severe failure, OPEN MAIN RELAY
    open: 65534,            // Open circuit reading
    hysteresisPercent: 20   // Clear at +20% of trigger
  },

  // ====================================================================
  // RATE-OF-CHANGE THRESHOLDS
  // Sudden changes indicate sensor faults, connection issues, or acute failures
  // ====================================================================
  rateOfChange: {
    cellVoltage: {
      normal: 10,           // mV/s - normal rate
      level2: 50,           // mV/s - warning, connection fault possible
      level3: 100           // mV/s - critical, cell failure suspected
    },
    cellDelta: {
      normal: 5,            // mV/min
      level2: 20,           // mV/min - rapid divergence
      level3: 50            // mV/min - acute cell problem
    },
    temperature: {
      normal: 1,            // °C/min
      level2: 3,            // °C/min - rapid rise
      level3: 5             // °C/min - thermal event
    },
    soc: {
      normalUnderLoad: 1,   // %/min
      level2: 5,            // %/min - sensor drift
      level3: 10            // %/min - sensor fault
    },
    insulation: {
      level2DropPercent: 20,    // % drop in 1 hour
      level3DropPercent: 50     // Sudden drop - acute breach
    }
  },

  // ====================================================================
  // HYSTERESIS VALUES
  // Prevent alarm chatter (rapid on/off cycling)
  // ====================================================================
  hysteresis: {
    cellVoltageHigh: 50,    // mV - clear at trigger - 50mV
    cellVoltageLow: 50,     // mV - clear at trigger + 50mV
    temperature: 3,         // °C
    cellDelta: 20,          // mV
    soc: 5,                 // %
    current: 10,            // % of rating
    insulationPercent: 20   // % above trigger to clear
  },

  // ====================================================================
  // TIME DELAY RECOMMENDATIONS (seconds)
  // Filter transient spikes before triggering alarms
  // ====================================================================
  timeDelay: {
    level1: 10,             // 5-10 seconds for informational
    level2: 3,              // 2-5 seconds for warnings
    level3: 1,              // 0-1 second for critical (immediate)
    temperature: 30,        // Thermal mass provides natural filtering
    overCurrentPeak: 10,    // Per 10s peak spec
    overCurrentSustained: 60 // Per 60s sustained spec
  },

  // ====================================================================
  // DATA VALIDATION BOUNDS
  // Values outside these ranges indicate sensor faults
  // ====================================================================
  dataValidation: {
    cellVoltage: { min: 0, max: 4000 },       // mV - LiFePO₄ impossible >4V
    temperature: { min: -50, max: 100 },       // °C
    soc: { min: 0, max: 100 },                 // %
    current: { maxMultiplier: 10 },            // >10x rating = sensor fault
    insulationMin: 0,                          // Negative = sensor fault
    cellVoltageJump: 500,                      // mV sudden jump = fault
    tempJump: 20                               // °C sudden jump = fault
  }
};

// ====================================================================
// COMPOUND FAULT ESCALATION RULES
// Some conditions are more severe when combined
// ====================================================================
export const COMPOUND_FAULTS = {
  // High temp + High current = escalate +1 level
  highTempHighCurrent: {
    tempThreshold: 55,      // °C
    currentPercent: 80,     // % of continuous rating
    escalate: 1
  },
  // High temp + High SOC = escalate +1 level
  highTempHighSoc: {
    tempThreshold: 55,      // °C
    socThreshold: 90,       // %
    escalate: 1
  },
  // Low temp + Charging = Level 3 IMMEDIATE
  lowTempCharging: {
    tempThreshold: 0,       // °C
    severity: 3             // Always critical
  },
  // Low SOC + High discharge current = escalate +1 level
  lowSocHighCurrent: {
    socThreshold: 15,       // %
    escalate: 1
  },
  // High cell delta + High current = escalate +1 level
  highDeltaHighCurrent: {
    deltaThreshold: 100,    // mV
    escalate: 1
  },
  // High cell delta + Low SOC = Level 3 (risk of cell reversal)
  highDeltaLowSoc: {
    deltaThreshold: 100,    // mV
    socThreshold: 20,       // %
    severity: 3
  },
  // Two Level 2 faults = escalate to Level 3
  multipleLevel2: {
    count: 2,
    escalateTo: 3
  }
};
