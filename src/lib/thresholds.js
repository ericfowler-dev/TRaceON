// =============================================================================
// BMS THRESHOLDS & PRODUCT SPECIFICATIONS
// =============================================================================

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
// ====================================================================
export const PRODUCT_SPECS = {
  '80V230Ah': {
    name: '80V 230Ah',
    packVoltage: { min: 60, max: 85.2 },
    cellConfig: '1P24S',
    seriesCellCount: 24,
    totalCells: 24,
    cellVoltage: { min: 2500, max: 3550 },
    capacity: 230
  },
  '80V304Ah': {
    name: '80V 304Ah',
    packVoltage: { min: 60, max: 85.2 },
    cellConfig: '1P24S',
    seriesCellCount: 24,
    totalCells: 24,
    cellVoltage: { min: 2500, max: 3550 },
    capacity: 304
  },
  '80V460Ah': {
    name: '80V 460Ah',
    packVoltage: { min: 60, max: 85.2 },
    cellConfig: '2P24S',
    seriesCellCount: 24,
    totalCells: 48,
    cellVoltage: { min: 2500, max: 3550 },
    capacity: 460
  },
  '96V230Ah': {
    name: '96V 230Ah',
    packVoltage: { min: 80, max: 113.6 },
    cellConfig: '1P32S',
    seriesCellCount: 32,
    totalCells: 32,
    cellVoltage: { min: 2500, max: 3550 },
    capacity: 230
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
  if (cellCount >= 30) {
    return RELAY_CONFIG_BY_PRODUCT['96V'];
  } else if (cellCount >= 24) {
    // 80V battery - check for 12V AUX option
    return has12VAux
      ? RELAY_CONFIG_BY_PRODUCT['80V_12V_AUX']
      : RELAY_CONFIG_BY_PRODUCT['80V'];
  }
  return RELAY_CONFIG_BY_PRODUCT['96V']; // Default fallback
}

export const ALL_RELAYS = ['Relay0', 'Relay1', 'Relay2', 'Relay3', 'Relay4', 'Relay5'];

// Anomaly thresholds - Based on PSI Technical Training Documentation
// Three-level system: GOOD (green) / MARGINAL (yellow) / BAD (red)
export const THRESHOLDS = {
  cellVoltage: {
    good: { min: 3200, max: 3550 },
    marginal: { min: 3000, max: 3650 },
    bad: { min: 2500, max: 4200 },
    critical: 5000
  },
  cellDiff: {
    good: 30,
    marginal: 150,
    critical: 200
  },
  packVoltage80V: {
    good: { min: 76.8, max: 85.2 },
    marginal: { min: 72, max: 90 },
    bad: { min: 60, max: 100 }
  },
  packVoltage96V: {
    good: { min: 102.4, max: 113.6 },
    marginal: { min: 96, max: 120 },
    bad: { min: 80, max: 130 }
  },
  temp: {
    good: { min: 15, max: 40 },
    marginalLow: { min: 5, max: 15 },
    marginalHigh: { min: 40, max: 50 },
    badLow: 5,
    badHigh: 50,
    critical: 60
  },
  tempDiff: {
    good: 5,
    marginal: 10,
    critical: 15
  },
  tempRiseRate: {
    good: 1,
    marginal: 2,
    bad: 5,
    critical: 5
  },
  insulation: {
    excellent: 2000,
    good: 500,
    warning: 100,
    fault: 100,
    critical: 40,
    open: 65534
  },
  insulationPath: {
    excellent: 500,
    good: 250,
    warning: 50,
    fault: 50
  },
  soc: {
    good: { min: 10, max: 100 },
    marginalHigh: { min: 100, max: 105 },
    badLow: 5,
    badHigh: 105
  },
  soh: {
    good: 90,
    marginal: 80,
    badLevel1: 70,
    badLevel2: 60,
    eol: 60
  }
};
