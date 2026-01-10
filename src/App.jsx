import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, ComposedChart, ReferenceLine
} from 'recharts';
import {
  FileSpreadsheet, Upload, AlertCircle, AlertTriangle, Clock, Zap,
  ThermometerSun, Battery, Activity, Gauge, Cpu, CheckCircle,
  ShieldAlert, Calendar, ChevronDown, ChevronRight, Table, X,
  Play, Pause, SkipBack, SkipForward, Camera, TrendingUp, Info,
  Search, Flag, Eye
} from 'lucide-react';

// =============================================================================
// CONSTANTS & MAPPINGS
// =============================================================================
const ALARM_MAPPING = {
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

const SEVERITY_MAP = { 'Lvl 1 Alarm': 1, 'Lvl 2 Alarm': 2, 'Lvl 3 Alarm': 3 };

// ====================================================================
// PRODUCT SPECIFICATIONS - Source: PSI Product Rating Guide
// Per-cell limits are derived from pack limits divided by series cell count.
// Parallel strings (e.g., 2P24S) change capacity but DO NOT change voltage.
// Always use series cell count for voltage calculations, not total cell count.
// ====================================================================
const PRODUCT_SPECS = {
  '80V230Ah': {
    name: '80V 230Ah',
    packVoltage: { min: 60, max: 85.2 },
    cellConfig: '1P24S',
    seriesCellCount: 24,
    totalCells: 24,
    // Derived per-cell limits: pack voltage / series cell count
    cellVoltage: { min: 2500, max: 3550 }, // mV (60V/24 = 2.50V, 85.2V/24 = 3.55V)
    capacity: 230
  },
  '80V304Ah': {
    name: '80V 304Ah',
    packVoltage: { min: 60, max: 85.2 },
    cellConfig: '1P24S',
    seriesCellCount: 24,
    totalCells: 24,
    cellVoltage: { min: 2500, max: 3550 }, // mV (60V/24 = 2.50V, 85.2V/24 = 3.55V)
    capacity: 304
  },
  '80V460Ah': {
    name: '80V 460Ah',
    packVoltage: { min: 60, max: 85.2 },
    cellConfig: '2P24S',
    seriesCellCount: 24,    // Only 24 cells in series
    totalCells: 48,          // 2 parallel strings × 24 series = 48 total
    // IMPORTANT: Use series count (24) for voltage math, NOT total cells (48)
    cellVoltage: { min: 2500, max: 3550 }, // mV (60V/24 = 2.50V, 85.2V/24 = 3.55V)
    capacity: 460
  },
  '96V230Ah': {
    name: '96V 230Ah',
    packVoltage: { min: 80, max: 113.6 },
    cellConfig: '1P32S',
    seriesCellCount: 32,
    totalCells: 32,
    cellVoltage: { min: 2500, max: 3550 }, // mV (80V/32 = 2.50V, 113.6V/32 = 3.55V)
    capacity: 230
  }
};

// Auto-detect product based on cell count and voltage range
function detectProduct(cellCount, avgPackVoltage) {
  // First try exact match on total cell count
  for (const [key, spec] of Object.entries(PRODUCT_SPECS)) {
    if (spec.totalCells === cellCount) {
      return { key, spec };
    }
  }

  // Fallback: detect by series cell count (for cases where log shows series count)
  if (cellCount === 24) {
    // Could be any 80V variant - use voltage to disambiguate
    return { key: '80V230Ah', spec: PRODUCT_SPECS['80V230Ah'] };
  } else if (cellCount === 32) {
    return { key: '96V230Ah', spec: PRODUCT_SPECS['96V230Ah'] };
  }

  // No match - return null
  return null;
}

// Relay mapping - from relay_cross_reference.csv
// Product-specific relay configurations
const RELAY_CONFIG_BY_PRODUCT = {
  // Default/Unknown configuration
  default: {
    'Relay0': 'Positive Relay',
    'Relay1': 'Charging Relay',
    'Relay2': 'Heating Relay',
    'Relay3': 'Alarm Relay',
    'Relay4': 'Pre-charge Relay',
    'Relay5': 'Negative Relay'
  },
  // 80V systems typically use pre-charge on Relay3
  '80V': {
    'Relay0': 'Positive Relay',
    'Relay1': 'Charging Relay',
    'Relay2': 'Heating Relay',
    'Relay3': 'Pre-charge Relay',
    'Relay4': 'Negative Relay',
    'Relay5': 'DC/DC Relay'
  },
  // 96V systems with alarm relay configuration
  '96V_ALARM': {
    'Relay0': 'Positive Relay',
    'Relay1': 'Charging Relay',
    'Relay2': 'Heating Relay',
    'Relay3': 'Alarm Relay',
    'Relay4': 'Pre-charge Relay',
    'Relay5': 'Negative Relay'
  }
};

// Legacy fallback for unknown configurations
const RELAY_NAMES = {
  'Relay0': 'Positive Relay',
  'Relay1': 'Charging Relay',
  'Relay2': 'Heating Relay',
  'Relay3': 'Alarm Relay / Pre-charge Relay',
  'Relay4': 'Pre-charge Relay / Negative Relay',
  'Relay5': 'Negative Relay / DC/DC Relay'
};

// Function to determine relay configuration based on device info
function getRelayConfig(deviceInfo, cellCount) {
  // Determine system voltage based on cell count
  if (cellCount >= 30) {
    // 96V system (30-32 cells)
    // Check if it's an alarm relay configuration (common in certain releases)
    return RELAY_CONFIG_BY_PRODUCT['96V_ALARM'];
  } else if (cellCount >= 24) {
    // 80V system (24-26 cells)
    return RELAY_CONFIG_BY_PRODUCT['80V'];
  }

  // Fallback to default
  return RELAY_CONFIG_BY_PRODUCT.default;
}

// All possible relays (0-5)
const ALL_RELAYS = ['Relay0', 'Relay1', 'Relay2', 'Relay3', 'Relay4', 'Relay5'];

// Anomaly thresholds - Based on PSI Technical Training Documentation
// Three-level system: GOOD (green) / MARGINAL (yellow) / BAD (red)
const THRESHOLDS = {
  // Cell Voltage (mV) - LiFePO4 Chemistry
  cellVoltage: {
    good: { min: 3200, max: 3550 },      // Normal operation
    marginal: { min: 3000, max: 3650 },  // Early stress indicators
    bad: { min: 2500, max: 4200 },       // Immediate threat to cell integrity
    critical: 5000                        // Definitely an error/sensor issue
  },

  // Cell Imbalance (voltage spread in mV)
  cellDiff: {
    good: 30,       // <30mV - well balanced
    marginal: 150,  // 30-150mV - investigate weak cells
    critical: 200   // >150mV - reduce charge rate, service soon
  },

  // Pack Voltage (V) - Auto-detect 80V or 96V system
  packVoltage80V: {
    good: { min: 76.8, max: 85.2 },      // 24 cells × 3.2-3.55V
    marginal: { min: 72, max: 90 },      // Check cell balance
    bad: { min: 60, max: 100 }           // Activate power reduction
  },
  packVoltage96V: {
    good: { min: 102.4, max: 113.6 },    // 32 cells × 3.2-3.55V
    marginal: { min: 96, max: 120 },     // Check cell balance
    bad: { min: 80, max: 130 }           // Activate power reduction
  },

  // Temperature (°C)
  temp: {
    good: { min: 15, max: 40 },          // Optimal operation
    marginalLow: { min: 5, max: 15 },    // Suboptimal, monitor
    marginalHigh: { min: 40, max: 50 },  // Suboptimal, prepare cooling
    badLow: 5,                           // <5°C - Risk of plating
    badHigh: 50,                         // >50°C - Thermal runaway risk
    critical: 60                         // >60°C - Emergency
  },

  // Temperature Spread (°C)
  tempDiff: {
    good: 5,        // <5°C - normal variance
    marginal: 10,   // 5-10°C - investigate heat distribution
    critical: 15    // >10°C - cell defect or contact resistance
  },

  // Temperature Rise Rate (°C/min) - Critical for thermal runaway
  tempRiseRate: {
    good: 1,        // <1°C/min - normal
    marginal: 2,    // 1-2°C/min - elevated
    bad: 5,         // 2-5°C/min - significant thermal event
    critical: 5     // >5°C/min - thermal runaway imminent
  },

  // Insulation Resistance (kΩ) - Industry Standards for 80V-105V Systems
  // Rule of thumb: ~1 MΩ per 1000V operating voltage
  // IEC 61557-8 / FMVSS 305: Critical fault at 100 Ω/V (8kΩ for 80V)
  // Warning threshold typically 500 Ω/V (40kΩ for 80V)
  //
  // NOTE: Insulation varies with operating conditions:
  // - Decreases as voltage rises (charging to 100% SOC)
  // - Decreases with temperature
  // - Higher at low SOC, lower at high SOC
  // - Affected by humidity, coolant leaks, vibration, aging
  insulation: {
    excellent: 2000,     // >2 MΩ - Fully healthy pack
    good: 500,           // 500kΩ - 2MΩ - Normal operation
    warning: 100,        // 100-500kΩ - Minor degradation, monitor closely
    fault: 100,          // <100kΩ - Dangerous, immediate action required
    critical: 40,        // <40kΩ - Below automotive warning threshold (500 Ω/V × 80V)
    open: 65534          // Open circuit indicator
  },

  // Individual insulation paths (Positive/Negative to ground)
  insulationPath: {
    excellent: 500,      // >500kΩ each path
    good: 250,           // 250-500kΩ - Normal
    warning: 50,         // 50-250kΩ - Minor degradation
    fault: 50            // <50kΩ - Dangerous
  },

  // State of Charge (%)
  soc: {
    good: { min: 10, max: 100 },         // Normal operating range
    marginalHigh: { min: 100, max: 105 }, // Coulomb counting drift
    badLow: 5,                            // <5% - Over-discharge risk
    badHigh: 105                          // >105% - Firmware error
  },

  // State of Health (%)
  soh: {
    good: 90,         // >90% - normal operation
    marginal: 80,     // 80-90% - begin replacement planning
    badLevel1: 70,    // 70-80% - schedule replacement soon
    badLevel2: 60,    // 60-70% - critical replacement window
    eol: 60           // <60% - end of life
  }
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================
const cleanKey = (k) => k ? k.replace(/^\ufeff/, '').trim() : '';

const parseDate = (str) => {
  if (!str || typeof str !== 'string') return null;
  const parts = str.trim().split(/[\s/:]+/);
  if (parts.length < 6) return null;
  const d = new Date(+parts[0], +parts[1] - 1, +parts[2], +parts[3], +parts[4], +parts[5]);
  return isNaN(d.getTime()) ? null : d;
};

const getVal = (row, ...keys) => {
  for (const key of keys) {
    for (const k of Object.keys(row)) {
      const clean = cleanKey(k);
      if (clean === key || clean.toLowerCase().includes(key.toLowerCase())) {
        const v = row[k];
        if (v !== null && v !== undefined && v !== '' && v !== 'Invalid') return v;
      }
    }
  }
  return undefined;
};

const findSheet = (sheets, ...terms) => {
  for (const term of terms) {
    const name = Object.keys(sheets).find(n => n.toLowerCase().includes(term.toLowerCase()));
    if (name) return sheets[name];
  }
  return [];
};

const fmt = (v, dec = 1) => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(dec);
const fmtTime = (d) => d ? d.toLocaleString() : '—';
const fmtDuration = (min) => {
  if (min == null) return '—';
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.round(min)}m`;
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
};

const formatInsulation = (val) => {
  if (val == null) return '—';
  if (val >= THRESHOLDS.insulation.open) return '> 65MΩ (Open)';
  if (val >= 1000) return `${(val / 1000).toFixed(2)} MΩ`;
  return `${val.toFixed(2)} kΩ`;
};

// Heat map for cell voltages (mV) - Three-level boundary system
// Uses absolute thresholds from PSI spec rather than relative positioning
const getVoltageHeatMap = (voltage, minV, maxV, avgV) => {
  if (voltage == null) return { bg: 'bg-slate-700/80', text: 'text-slate-400', label: 'NO DATA' };

  // Error detection - sensor issues
  if (voltage > THRESHOLDS.cellVoltage.critical || voltage < 1000) {
    return { bg: 'bg-red-600/90', text: 'text-white', label: 'ERROR' };
  }

  // BAD level - Immediate threat to cell integrity (RED)
  if (voltage < THRESHOLDS.cellVoltage.marginal.min || voltage > THRESHOLDS.cellVoltage.marginal.max) {
    if (voltage < THRESHOLDS.cellVoltage.good.min) {
      return { bg: 'bg-red-500/80', text: 'text-white', label: 'LOW' };
    } else {
      return { bg: 'bg-red-500/80', text: 'text-white', label: 'HIGH' };
    }
  }

  // MARGINAL level - Early stress indicators (YELLOW/AMBER)
  if (voltage < THRESHOLDS.cellVoltage.good.min || voltage > THRESHOLDS.cellVoltage.good.max) {
    if (voltage < THRESHOLDS.cellVoltage.good.min) {
      return { bg: 'bg-amber-500/80', text: 'text-slate-900', label: 'BELOW' };
    } else {
      return { bg: 'bg-amber-500/80', text: 'text-slate-900', label: 'ABOVE' };
    }
  }

  // GOOD level - Normal operation (GREEN)
  // Within 3200-3550mV range - use gradient within this range
  const goodRange = THRESHOLDS.cellVoltage.good.max - THRESHOLDS.cellVoltage.good.min;
  const position = (voltage - THRESHOLDS.cellVoltage.good.min) / goodRange;

  if (position < 0.3) {
    return { bg: 'bg-green-500/70', text: 'text-white', label: 'GOOD' };
  } else if (position < 0.7) {
    return { bg: 'bg-green-500/90', text: 'text-white', label: 'OPTIMAL' };
  } else {
    return { bg: 'bg-green-600/80', text: 'text-white', label: 'GOOD' };
  }
};

// =============================================================================
// HELPER COMPONENTS
// =============================================================================
const InfoBox = ({ label, value, small }) => (
  <div className="bg-slate-800/50 rounded-lg p-4">
    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1.5">{label}</div>
    <div className={`font-semibold ${small ? 'text-sm font-mono' : 'text-base'} text-white truncate`}>{value || '—'}</div>
  </div>
);

const MetricCard = ({ icon, label, value, sub, unit, alert }) => (
  <div className={`bg-slate-900/50 rounded-xl border p-6 ${alert ? 'border-red-500/50' : 'border-slate-800'}`}>
    <div className="flex items-center gap-2 mb-4">
      <div className="w-9 h-9 rounded-lg bg-slate-800/50 flex items-center justify-center">{icon}</div>
      <div className="text-sm text-slate-400 uppercase tracking-wider font-medium">{label}</div>
    </div>
    <div className="text-2xl font-bold text-white font-mono">{value} {unit && <span className="text-lg text-slate-400">{unit}</span>}</div>
    {sub && <div className="text-sm text-slate-400 mt-2 font-mono">{sub}</div>}
  </div>
);

const ChartCard = ({ title, icon, children }) => (
  <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
    <div className="flex items-center gap-2 mb-4 text-base font-semibold text-slate-300">
      {icon} {title}
    </div>
    {children}
  </div>
);

const SnapBox = ({ label, value }) => (
  <div className="p-2">
    <div className="text-slate-500 text-xs uppercase mb-1">{label}</div>
    <div className="font-mono text-white text-sm">{value}</div>
  </div>
);

const Row = ({ label, value, highlight }) => (
  <div className="flex justify-between py-1.5 px-2">
    <span className="text-slate-400 text-sm">{label}</span>
    <span className={`font-mono text-sm ${highlight ? `text-${highlight}-400 font-semibold` : 'text-white'}`}>{value}</span>
  </div>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const BMSAnalyzer = () => {
  const [rawSheets, setRawSheets] = useState({});
  const [timeSeries, setTimeSeries] = useState([]);
  const [faultEvents, setFaultEvents] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [deviceInfo, setDeviceInfo] = useState({});
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDate, setSelectedDate] = useState('all');
  const [playbackIdx, setPlaybackIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 0.25x, 0.5x, 1x, 2x, 4x
  const [expandedSheets, setExpandedSheets] = useState({});
  const [showAllRows, setShowAllRows] = useState({});
  const [searchTime, setSearchTime] = useState('');
  const [chartZoom, setChartZoom] = useState({ start: 0, end: 100 }); // Percentage of data to show

  // ---------------------------------------------------------------------------
  // FILE PROCESSING
  // ---------------------------------------------------------------------------
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file && /\.xlsx?$/i.test(file.name)) processFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const processFile = (file) => {
    setIsLoading(true);
    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const sheets = {};
        wb.SheetNames.forEach(name => {
          sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
        });
        setRawSheets(sheets);
        processData(sheets);
      } catch (err) {
        setError('Failed to parse file: ' + err.message);
        setIsLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const processData = (sheets) => {
    console.log('Processing sheets:', Object.keys(sheets));

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

    // Process VOLTAGES
    voltages.forEach((row, rowIdx) => {
      const t = parseDate(getVal(row, 'Time'));
      if (!t) return;
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

      e.packVoltage = parseFloat(getVal(row, 'Pack volt.(V)')) || undefined;
      const curr = parseFloat(getVal(row, 'Current(A)'));
      e.current = isNaN(curr) ? undefined : curr;

      // Extract ALL cell voltages and check for anomalies
      let hasAnomaly = false;
      const anomalyCells = [];

      Object.keys(row).forEach(k => {
        const m = cleanKey(k).match(/Cell volt\.N\+(\d+)/i);
        if (m) {
          const cellIdx = parseInt(m[1]);
          const v = parseFloat(row[k]);
          if (!isNaN(v)) {
            e.cells[cellIdx] = v;
            e[`cell${cellIdx}`] = v;

            // Check for anomalies using new three-level thresholds
            if (v > THRESHOLDS.cellVoltage.critical || v < THRESHOLDS.cellVoltage.bad.min) {
              hasAnomaly = true;
              anomalyCells.push({ cell: cellIdx, voltage: v });
            }
          }
        }
      });

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
    });

    // Process TEMPERATURES
    temps.forEach(row => {
      const t = parseDate(getVal(row, 'Time'));
      if (!t) return;
      const ts = t.getTime();
      const dateKey = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;

      if (!dataMap.has(ts)) {
        dataMap.set(ts, { time: t, ts, dateKey, cells: {}, relays: {} });
      }
      const e = dataMap.get(ts);

      Object.keys(row).forEach(k => {
        const cleaned = cleanKey(k);
        // Match CellTemp1(℃) or CellTemp1 format
        const m = cleaned.match(/CellTemp(\d+)/i);
        if (m) {
          const v = parseFloat(row[k]);
          if (!isNaN(v) && v > -50 && v < 150) e[`temp${m[1]}`] = v;
        }
      });
    });

    // Process PEAKS
    peaks.forEach(row => {
      const t = parseDate(getVal(row, 'Time'));
      if (!t) return;
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
    });

    // Process SYSTEM STATE
    system.forEach(row => {
      const t = parseDate(getVal(row, 'Time'));
      if (!t) return;
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
      ALL_RELAYS.forEach(relayId => {
        e.relays[relayId] = 'OFF'; // Default to OFF
      });

      // Parse relay states - Excel has "Relay 0" with space, not "Relay0"
      Object.keys(row).forEach(k => {
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
      });
    });

    // Process CELL BALANCING
    balancing.forEach(row => {
      const t = parseDate(getVal(row, 'Time'));
      if (!t) return;
      const ts = t.getTime();

      if (!dataMap.has(ts)) {
        dataMap.set(ts, { time: t, ts, cells: {}, relays: {}, balancing: {} });
      }
      const e = dataMap.get(ts);
      e.balancing = e.balancing || {};

      // Parse balancing states for each cell
      Object.keys(row).forEach(k => {
        const m = cleanKey(k).match(/Balancing\s+state\s+(\d+)/i);
        if (m) {
          const cellNum = parseInt(m[1]);
          const val = row[k];
          e.balancing[cellNum] = val === 'Balance' ? 'ACTIVE' : 'OFF';
        }
      });
    });

    // Process ENERGY DATA
    energy.forEach(row => {
      const t = parseDate(getVal(row, 'Time'));
      if (!t) return;
      const ts = t.getTime();

      if (!dataMap.has(ts)) {
        dataMap.set(ts, { time: t, ts, cells: {}, relays: {} });
      }
      const e = dataMap.get(ts);

      e.chargedEnergy = parseFloat(getVal(row, 'This time charged energy')) || undefined;
      e.accChargedEnergy = parseFloat(getVal(row, 'Acc. charged energy')) || undefined;
      e.dischargedEnergy = parseFloat(getVal(row, 'This time discharged energy')) || undefined;
      e.accDischargedEnergy = parseFloat(getVal(row, 'Acc. discharged energy')) || undefined;
    });

    // Process CHARGING DATA
    charging.forEach(row => {
      const t = parseDate(getVal(row, 'Time'));
      if (!t) return;
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
    });

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

    const firstEntry = Array.from(dataMap.values())[0];
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
      dataMap.forEach((e) => {
        Object.entries(e.cells).forEach(([cellIdx, voltage]) => {
          if (voltage == null || voltage < 1000 || voltage > 5000) return;

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
        });
      });
    }

    dataMap.forEach((e) => {
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
        Object.entries(e.cells).forEach(([cellIdx, voltage]) => {
          if (voltage == null || voltage < 1000 || voltage > 5000) return;

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
        });
      }
    });

    // Additional anomaly detection pass - pack voltage, temperature, insulation, SOC, SOH
    dataMap.forEach((e) => {
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
    });

    const sorted = Array.from(dataMap.values()).sort((a, b) => a.ts - b.ts);
    console.log('Time series:', sorted.length, 'entries');
    console.log('Anomalies detected:', detectedAnomalies.length);

    // Process FAULTS
    const faults = [];
    const activeFaultState = new Map();

    alarms.forEach((row, rowIdx) => {
      const t = parseDate(getVal(row, 'Time'));
      if (!t) return;

      Object.keys(row).forEach(rawKey => {
        const key = cleanKey(rawKey);
        if (key === 'Time' || key === 'Alarm number') return;

        const val = row[rawKey];
        if (typeof val !== 'string') return;

        const trimVal = val.trim();
        const severity = SEVERITY_MAP[trimVal];
        const prevState = activeFaultState.get(key);
        const currentState = severity || 0;

        if (currentState !== (prevState?.severity || 0)) {
          if (currentState > 0) {
            const snapshot = sorted.find(s => Math.abs(s.ts - t.getTime()) < 2000) || {};

            const evt = {
              id: `${key}-${t.getTime()}`,
              code: key,
              name: ALARM_MAPPING[key] || key,
              severity: currentState,
              severityText: trimVal,
              eventType: 'SET',
              time: t,
              timeStr: t.toLocaleString(),
              snapshot: { ...snapshot },
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
      });
    });

    // Mark ongoing faults
    const lastTime = sorted[sorted.length - 1]?.time;
    activeFaultState.forEach((state) => {
      if (state.severity > 0 && state.event && !state.event.endTime && lastTime) {
        state.event.endTime = lastTime;
        state.event.duration = (lastTime.getTime() - state.startTime.getTime()) / 60000;
        state.event.ongoing = true;
      }
    });

    // Device info - comprehensive logging and extraction
    const dev = devInfo[0] || {};
    const devL = devList[0] || {};

    console.log('=== DEVICE INFO DEBUG ===');
    console.log('Device Info sheet rows:', devInfo.length);
    console.log('Device List sheet rows:', devList.length);
    console.log('Device Info first row keys:', Object.keys(dev));
    console.log('Device List first row keys:', Object.keys(devL));
    console.log('Device Info first row:', dev);
    console.log('Device List first row:', devL);

    // Check if device info is actually empty (only has Time field or Time is empty)
    const devKeys = Object.keys(dev).filter(k => k.toLowerCase() !== 'time' && k !== '﻿Time');
    const devLKeys = Object.keys(devL).filter(k => k.toLowerCase() !== 'time' && k !== '﻿Time');
    console.log('Device Info has', devKeys.length, 'non-time fields');
    console.log('Device List has', devLKeys.length, 'non-time fields');

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

    console.log('Extracted values:', { release, fwid, hwid });

    const deviceInfoObj = {
      release: release || '—',
      fwid: fwid || '—',
      burnId: getVal(dev, 'BurnID', 'Burn ID', 'BurnId') || '—',
      hwid: hwid || '—',
      fwVer: getVal(devL, 'Hardware Device 1 FWVerion', 'FW Version', 'FWVerion', 'Firmware Version') || '—'
    };
    console.log('Setting deviceInfo:', deviceInfoObj);
    setDeviceInfo(deviceInfoObj);

    setTimeSeries(sorted);
    setFaultEvents(faults.sort((a, b) => b.time - a.time));
    setAnomalies(detectedAnomalies);
    setPlaybackIdx(0);
    setIsLoading(false);
  };

  // ---------------------------------------------------------------------------
  // COMPUTED DATA
  // ---------------------------------------------------------------------------
  const availableDates = useMemo(() => {
    const dates = [...new Set(timeSeries.map(d => d.dateKey))].filter(Boolean);
    return dates.sort();
  }, [timeSeries]);

  const filteredData = useMemo(() => {
    if (selectedDate === 'all') return timeSeries;
    return timeSeries.filter(d => d.dateKey === selectedDate);
  }, [timeSeries, selectedDate]);

  const stats = useMemo(() => {
    if (!filteredData.length) return null;

    const first = filteredData[0];
    const last = filteredData[filteredData.length - 1];
    const cellKeys = Object.keys(first.cells || {});

    const packVs = filteredData.map(d => d.packVoltage).filter(v => v != null);
    const currents = filteredData.map(d => d.current).filter(v => v != null);

    // For cell stats, exclude obvious errors (>5000mV)
    const validCellMaxs = filteredData.map(d => d.maxCellV).filter(v => v != null && v < 5000);
    const validCellMins = filteredData.map(d => d.minCellV).filter(v => v != null && v > 1000);
    const cellDiffs = filteredData.map(d => d.cellDiff).filter(v => v != null && v < 2000);

    const tempMaxs = filteredData.map(d => d.maxTemp).filter(v => v != null && v > -40);
    const tempMins = filteredData.map(d => d.minTemp).filter(v => v != null && v > -40);
    const tempDiffs = filteredData.map(d => d.tempDiff).filter(v => v != null);
    const socs = filteredData.map(d => d.soc).filter(v => v != null);
    const sohs = filteredData.map(d => d.soh).filter(v => v != null);
    const insulations = filteredData.map(d => d.insulationRes).filter(v => v != null && v < THRESHOLDS.insulation.open);

    const dateFilteredFaults = selectedDate === 'all' ? faultEvents
      : faultEvents.filter(f => {
          const fd = f.time;
          const fDateKey = `${fd.getFullYear()}-${String(fd.getMonth()+1).padStart(2,'0')}-${String(fd.getDate()).padStart(2,'0')}`;
          return fDateKey === selectedDate;
        });

    const dateFilteredAnomalies = selectedDate === 'all' ? anomalies
      : anomalies.filter(a => {
          const ad = a.time;
          const aDateKey = `${ad.getFullYear()}-${String(ad.getMonth()+1).padStart(2,'0')}-${String(ad.getDate()).padStart(2,'0')}`;
          return aDateKey === selectedDate;
        });

    // Energy stats
    const energyData = filteredData.filter(d => d.accChargedEnergy || d.accDischargedEnergy);
    const energyStats = energyData.length ? {
      charged: last.accChargedEnergy || 0,
      discharged: last.accDischargedEnergy || 0,
      efficiency: last.accChargedEnergy && last.accDischargedEnergy
        ? ((last.accDischargedEnergy / last.accChargedEnergy) * 100)
        : null
    } : null;

    // Balancing stats - count how many unique cells have been balanced
    const balancingCells = new Set();
    filteredData.forEach(d => {
      if (d.balancing) {
        Object.entries(d.balancing).forEach(([cell, state]) => {
          if (state === 'ACTIVE') balancingCells.add(cell);
        });
      }
    });

    return {
      timeRange: { start: first.time, end: last.time },
      duration: (last.ts - first.ts) / 60000,
      samples: filteredData.length,
      cellCount: cellKeys.length,
      balancingCells: balancingCells.size,
      energy: energyStats,
      packV: packVs.length ? {
        min: Math.min(...packVs), max: Math.max(...packVs),
        avg: packVs.reduce((a, b) => a + b, 0) / packVs.length,
        current: last.packVoltage
      } : null,
      current: currents.length ? {
        min: Math.min(...currents), max: Math.max(...currents),
        avg: currents.reduce((a, b) => a + b, 0) / currents.length,
        current: last.current
      } : null,
      cellV: validCellMaxs.length ? {
        min: Math.min(...validCellMins), max: Math.max(...validCellMaxs),
        maxDiff: cellDiffs.length ? Math.max(...cellDiffs) : null
      } : null,
      temp: tempMaxs.length ? {
        min: Math.min(...tempMins), max: Math.max(...tempMaxs),
        maxDiff: tempDiffs.length ? Math.max(...tempDiffs) : null
      } : null,
      soc: socs.length ? {
        start: socs[0], end: socs[socs.length - 1],
        min: Math.min(...socs), max: Math.max(...socs)
      } : null,
      soh: sohs.length ? { current: last.soh, min: Math.min(...sohs), max: Math.max(...sohs) } : null,
      insulation: insulations.length ? {
        min: Math.min(...insulations), max: Math.max(...insulations),
        current: last.insulationRes
      } : { current: last.insulationRes },
      faults: {
        total: dateFilteredFaults.length,
        l3: dateFilteredFaults.filter(f => f.severity === 3).length,
        l2: dateFilteredFaults.filter(f => f.severity === 2).length,
        l1: dateFilteredFaults.filter(f => f.severity === 1).length
      },
      anomalies: dateFilteredAnomalies.length,
      last
    };
  }, [filteredData, faultEvents, anomalies, selectedDate]);

  // Smart relay configuration based on device info and cell count
  const relayConfig = useMemo(() => {
    if (stats && stats.cellCount) {
      return getRelayConfig(deviceInfo, stats.cellCount);
    }
    return RELAY_NAMES; // Fallback to legacy names if stats not available
  }, [stats, deviceInfo]);

  // LTTB (Largest-Triangle-Three-Buckets) downsampling for performance
  // Preserves visual shape while reducing SVG overhead by intelligently selecting representative points
  const lttbDownsample = (data, threshold) => {
    if (data.length <= threshold) return data;

    const sampled = [];
    sampled.push(data[0]); // Always keep first point

    const bucketSize = (data.length - 2) / (threshold - 2);
    let a = 0; // Initially point A is first point

    for (let i = 0; i < threshold - 2; i++) {
      // Calculate point average for next bucket
      const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
      const avgRangeEnd = Math.floor((i + 2) * bucketSize) + 1;
      const avgRangeEnd2 = Math.min(avgRangeEnd, data.length);

      let avgX = 0;
      let avgY = 0;
      let avgRangeLength = avgRangeEnd2 - avgRangeStart;

      for (let j = avgRangeStart; j < avgRangeEnd2; j++) {
        avgX += j;
        avgY += (data[j].packVoltage || 0);
      }
      avgX /= avgRangeLength;
      avgY /= avgRangeLength;

      // Get range for this bucket
      const rangeOffs = Math.floor(i * bucketSize) + 1;
      const rangeTo = Math.floor((i + 1) * bucketSize) + 1;

      // Point A
      const pointAX = a;
      const pointAY = data[a].packVoltage || 0;

      let maxArea = -1;
      let maxAreaPoint = rangeOffs;

      for (let j = rangeOffs; j < rangeTo; j++) {
        // Calculate triangle area
        const area = Math.abs(
          (pointAX - avgX) * ((data[j].packVoltage || 0) - pointAY) -
          (pointAX - j) * (avgY - pointAY)
        ) * 0.5;

        if (area > maxArea) {
          maxArea = area;
          maxAreaPoint = j;
        }
      }

      sampled.push(data[maxAreaPoint]);
      a = maxAreaPoint;
    }

    sampled.push(data[data.length - 1]); // Always keep last point
    return sampled;
  };

  const chartData = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return [];

    const maxPts = 300; // Further reduced for better performance (was 400)

    // Use LTTB if data exceeds threshold, otherwise use all data
    const downsampledData = filteredData.length > maxPts
      ? lttbDownsample(filteredData, maxPts)
      : filteredData;

    console.log(`chartData: Processing ${downsampledData.length} points (from ${filteredData.length} original)`);

    return downsampledData.map(d => {
      // Build cell voltage object - ensure keys are numeric and map to cell0, cell1, cell2, etc.
      const cellVoltages = {};
      if (d.cells) {
        Object.entries(d.cells).forEach(([k, v]) => {
          // Parse cell index (handle both "0" and "1" based indexing)
          const cellIdx = parseInt(k, 10);
          if (!isNaN(cellIdx) && v != null) {
            // Only include valid voltages, but don't filter out the key entirely
            // This ensures cell keys exist even if some values are invalid
            if (v >= 1000 && v <= 5000) {
              cellVoltages[`cell${cellIdx}`] = v;
            }
          }
        });
      }

      // Build temperature object
      const temps = {};
      Object.entries(d).forEach(([k, v]) => {
        if (/^temp\d+$/.test(k) && v != null) {
          temps[k] = v;
        }
      });

      return {
        time: d.timeStr,
        fullTime: d.fullTime,
        dateKey: d.dateKey,
        packV: d.packVoltage,
        current: d.current,
        soc: d.soc,
        maxCell: d.maxCellV && d.maxCellV < 5000 ? d.maxCellV : null,
        minCell: d.minCellV && d.minCellV > 1000 ? d.minCellV : null,
        cellDiff: d.cellDiff && d.cellDiff < 2000 ? d.cellDiff : null,
        maxTemp: d.maxTemp != null && d.maxTemp > -40 && d.maxTemp < 150 ? d.maxTemp : null,
        minTemp: d.minTemp != null && d.minTemp > -40 && d.minTemp < 150 ? d.minTemp : null,
        systemState: d.systemState,
        ...cellVoltages,
        ...temps
      };
    }).map((entry, idx) => {
      // Log first entry to verify cell data structure
      if (idx === 0) {
        const cellKeys = Object.keys(entry).filter(k => k.startsWith('cell'));
        console.log(`chartData: First entry has ${cellKeys.length} cell keys:`, cellKeys.slice(0, 5));
      }
      return entry;
    });
  }, [filteredData]);

  // Apply zoom to chart data
  const zoomedChartData = useMemo(() => {
    if (!chartData.length) return [];

    const startIdx = Math.floor((chartData.length * chartZoom.start) / 100);
    const endIdx = Math.ceil((chartData.length * chartZoom.end) / 100);

    // Ensure we always have at least some data points
    const safeStartIdx = Math.max(0, Math.min(startIdx, chartData.length - 1));
    const safeEndIdx = Math.max(safeStartIdx + 1, Math.min(endIdx, chartData.length));

    return chartData.slice(safeStartIdx, safeEndIdx);
  }, [chartData, chartZoom]);

  // Detect date changes in chart data for visual markers
  const dateChangeMarkers = useMemo(() => {
    const markers = [];
    let prevDate = null;

    chartData.forEach((d, i) => {
      if (d.dateKey && d.dateKey !== prevDate && prevDate !== null) {
        // Format date nicely (e.g., "Jan 15")
        const dateObj = new Date(d.dateKey);
        const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        markers.push({
          time: d.time,
          label: formattedDate,
          fullDate: d.dateKey
        });
      }
      prevDate = d.dateKey;
    });

    return markers;
  }, [chartData]);

  const currentSnap = filteredData[playbackIdx] || null;

  // Playback timer with variable speed
  useEffect(() => {
    if (!isPlaying || !filteredData.length) return;
    // Base interval is 100ms, adjusted by playback speed
    const interval = setInterval(() => {
      setPlaybackIdx(prev => {
        if (prev >= filteredData.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 100 / playbackSpeed); // Faster speeds = shorter interval
    return () => clearInterval(interval);
  }, [isPlaying, filteredData.length, playbackSpeed]);

  // Jump to time
  const jumpToTime = (timeStr) => {
    if (!timeStr || !timeStr.trim()) return;
    const idx = filteredData.findIndex(d => d.fullTime?.includes(timeStr) || d.timeStr?.includes(timeStr));
    if (idx >= 0) {
      setPlaybackIdx(idx);
      setActiveTab('snapshot');
    }
  };

  // Jump to anomaly
  const jumpToAnomaly = (anomaly) => {
    const idx = filteredData.findIndex(d => Math.abs(d.ts - anomaly.time.getTime()) < 2000);
    if (idx >= 0) {
      setPlaybackIdx(idx);
      setActiveTab('snapshot');
    }
  };

  const reset = () => {
    setTimeSeries([]);
    setFaultEvents([]);
    setAnomalies([]);
    setRawSheets({});
    setDeviceInfo({});
    setFileName('');
    setSelectedDate('all');
    setPlaybackIdx(0);
  };

  // ---------------------------------------------------------------------------
  // RENDER: UPLOAD SCREEN
  // ---------------------------------------------------------------------------
  if (!timeSeries.length) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
        <div
          className="w-full max-w-2xl border-2 border-dashed border-slate-700 rounded-3xl p-16 text-center hover:border-emerald-500/50 transition-all cursor-pointer"
          onClick={() => document.getElementById('fileIn').click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
        >
          <input id="fileIn" type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />

          {isLoading ? (
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-white text-lg">Analyzing BMS data...</p>
            </div>
          ) : error ? (
            <div className="text-red-400">
              <AlertCircle className="w-16 h-16 mx-auto mb-4" />
              <p>{error}</p>
            </div>
          ) : (
            <>
              {/* TRaceON Logo */}
              <div className="mb-8">
                <img src="traceon-logo-psi.png" alt="TRaceON" className="h-24 mx-auto" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-3">Battery Management System Analyzer</h1>
              <p className="text-slate-400 mb-6">Drop your Excel file or click to browse</p>
              <div className="flex justify-center gap-6 text-sm text-slate-500">
                <span className="flex items-center gap-1"><Zap className="w-4 h-4 text-cyan-400" /> Voltages</span>
                <span className="flex items-center gap-1"><ThermometerSun className="w-4 h-4 text-orange-400" /> Temps</span>
                <span className="flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-red-400" /> Faults</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: MAIN DASHBOARD
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="bg-slate-900/80 border-b border-slate-800 sticky top-0 z-50 backdrop-blur">
        <div className="w-full px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* TRaceON Logo */}
            <img src="traceon-logo.png" alt="TRaceON" className="h-10" />
            <div className="border-l border-slate-700 pl-4">
              <h1 className="text-lg font-semibold">{fileName}</h1>
              <p className="text-sm text-slate-500">{stats?.samples} samples • {fmtDuration(stats?.duration)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Date Filter */}
            {availableDates.length > 1 && (
              <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <select
                  className="bg-transparent border-none text-sm font-medium cursor-pointer focus:outline-none"
                  value={selectedDate}
                  onChange={(e) => { setSelectedDate(e.target.value); setPlaybackIdx(0); }}
                >
                  <option value="all">All Dates ({timeSeries.length})</option>
                  {availableDates.map(d => {
                    const count = timeSeries.filter(t => t.dateKey === d).length;
                    return <option key={d} value={d}>{d} ({count})</option>;
                  })}
                </select>
              </div>
            )}

            {/* Navigation Tabs - Professional Modern Design */}
            <div className="flex items-center gap-3">
              {['overview', 'charts', 'faults', 'snapshot', 'raw'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-7 py-3.5 rounded-xl text-base font-semibold transition-all duration-200 relative ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/40 hover:bg-blue-500 hover:shadow-xl hover:shadow-blue-500/50'
                      : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-700/80 hover:shadow-md border border-slate-700/50 hover:border-slate-600'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tab === 'faults' && stats?.anomalies > 0 && (
                    <span className="ml-2 px-2.5 py-1 bg-red-500 text-white text-xs font-bold rounded-full animate-pulse shadow-lg">
                      {stats.anomalies}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <button onClick={reset} className="p-2.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-6 py-6 space-y-8 mx-auto" style={{ maxWidth: '98%' }}>

        {/* ==================== OVERVIEW ==================== */}
        {activeTab === 'overview' && (stats || timeSeries.length > 0) && (
          <>
            {/* Device Info - Show even if empty, will display "—" for missing values */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
              <div className="flex items-center gap-2 mb-5 text-base text-slate-300 font-semibold">
                <Cpu className="w-5 h-5 text-cyan-400" /> Device Information & Session Summary
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-5">
                <InfoBox label="Release" value={deviceInfo?.release} />
                <InfoBox label="HWID" value={deviceInfo?.hwid} small />
                <InfoBox label="FWID" value={deviceInfo?.fwid} />
                <InfoBox label="Cells" value={stats?.cellCount} />
                <InfoBox label="SOH" value={`${fmt(stats?.soh?.current)}%`} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 border-t border-slate-700 pt-5">
                <InfoBox label="Start Time" value={stats?.timeRange?.start?.toLocaleString() || '—'} />
                <InfoBox label="End Time" value={stats?.timeRange?.end?.toLocaleString() || '—'} />
                <InfoBox label="Duration" value={fmtDuration(stats?.duration)} />
                <InfoBox label="Samples" value={stats?.samples} />
              </div>
            </div>

            {/* Anomaly Alert */}
            {anomalies.length > 0 && (
              <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-6 h-6 text-red-400" />
                  <div className="flex-1">
                    <div className="font-semibold text-red-400">{anomalies.length} Data Anomalies Detected</div>
                    <div className="text-sm text-red-300/70">Abnormal voltage readings found - possible sensor errors or communication issues</div>
                  </div>
                  <button onClick={() => setActiveTab('faults')} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm">
                    View Details
                  </button>
                </div>
              </div>
            )}

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-5">
              <MetricCard icon={<Zap className="text-emerald-400 w-5 h-5" />} label="Pack Voltage"
                value={`${fmt(stats.packV?.avg)}V`} sub={`${fmt(stats.packV?.min)} – ${fmt(stats.packV?.max)}V`} />
              <MetricCard icon={<Activity className="text-cyan-400 w-5 h-5" />} label="Cell Voltage"
                value={`${stats.cellV?.min ?? '—'} – ${stats.cellV?.max ?? '—'}`} sub={`Max Δ: ${stats.cellV?.maxDiff ?? '—'}mV`} unit="mV" />
              <MetricCard icon={<ThermometerSun className="text-orange-400 w-5 h-5" />} label="Temperature"
                value={`${stats.temp?.min ?? '—'} – ${stats.temp?.max ?? '—'}`} sub={`Max Δ: ${stats.temp?.maxDiff ?? '—'}°C`} unit="°C" />
              <MetricCard icon={<Gauge className="text-violet-400 w-5 h-5" />} label="SOC"
                value={`${fmt(stats.soc?.start)} → ${fmt(stats.soc?.end)}`} sub={`Range: ${fmt(stats.soc?.min)}% – ${fmt(stats.soc?.max)}%`} unit="%" />
              <MetricCard icon={<Zap className="text-amber-400 w-5 h-5" />} label="Current"
                value={`${fmt(stats.current?.avg, 1)}`} sub={`${fmt(stats.current?.min)} – ${fmt(stats.current?.max)}A`} unit="A" />
              <MetricCard
                icon={<AlertTriangle className={`w-5 h-5 ${stats.faults?.l3 || stats.anomalies ? 'text-red-400' : stats.faults?.total ? 'text-orange-400' : 'text-emerald-400'}`} />}
                label="Issues"
                value={stats.faults?.total + stats.anomalies || 'None'}
                sub={stats.faults?.total ? `Faults: ${stats.faults.total} | Anomalies: ${stats.anomalies}` : 'All clear'}
                alert={stats.faults?.l3 > 0 || stats.anomalies > 0}
              />
            </div>

            {/* Additional Metrics Row - Energy & Balancing */}
            {(stats.energy || stats.balancingCells > 0) && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {stats.energy && (
                  <>
                    <MetricCard icon={<TrendingUp className="text-emerald-400 w-5 h-5" />} label="Energy Charged"
                      value={fmt(stats.energy.charged, 0)} unit="AH" sub="Total accumulated" />
                    <MetricCard icon={<Activity className="text-orange-400 w-5 h-5" />} label="Energy Discharged"
                      value={fmt(stats.energy.discharged, 0)} unit="AH" sub="Total accumulated" />
                    {stats.energy.efficiency && (
                      <MetricCard icon={<Gauge className="text-cyan-400 w-5 h-5" />} label="Efficiency"
                        value={fmt(stats.energy.efficiency, 1)} unit="%" sub="Discharge / Charge" />
                    )}
                  </>
                )}
                {stats.balancingCells > 0 && (
                  <MetricCard icon={<Activity className="text-violet-400 w-5 h-5" />} label="Balancing"
                    value={stats.balancingCells} sub={`${stats.balancingCells} cell${stats.balancingCells > 1 ? 's' : ''} balanced in session`} />
                )}
              </div>
            )}

            {/* Charts */}
            {chartData.length > 0 && (
              <div className="grid md:grid-cols-2 gap-4">
                <ChartCard title="Cell Voltage Range" icon={<Activity className="w-4 h-4 text-cyan-400" />}>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="gVolt" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="time" stroke="#475569" fontSize={10} />
                      <YAxis domain={['dataMin-30', 'dataMax+30']} stroke="#475569" fontSize={10} />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                        cursor={{ stroke: '#475569', strokeWidth: 1 }}
                        wrapperStyle={{ zIndex: 1000 }}
                        allowEscapeViewBox={{ x: true, y: true }}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="maxCell" stroke="#10b981" fill="url(#gVolt)" name="Max (mV)" connectNulls dot={false} isAnimationActive={false} />
                      <Area type="monotone" dataKey="minCell" stroke="#06b6d4" fill="none" name="Min (mV)" connectNulls dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Temperature Range - Thermal Monitor" icon={<ThermometerSun className="w-4 h-4 text-orange-400" />}>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gTemp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="time" stroke="#475569" fontSize={11} tick={{fill: '#475569'}} />
                      <YAxis domain={['dataMin-2', 'dataMax+2']} stroke="#475569" fontSize={11} tickFormatter={(val) => `${val}°C`} />

                      {/* Temperature threshold warnings */}
                      <ReferenceLine y={50} label={{ position: 'right', value: 'High', fill: '#ef4444', fontSize: 10 }} stroke="#ef4444" strokeDasharray="3 3" />
                      <ReferenceLine y={10} label={{ position: 'right', value: 'Low', fill: '#3b82f6', fontSize: 10 }} stroke="#3b82f6" strokeDasharray="3 3" />

                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: '12px' }}
                        cursor={{ stroke: '#475569', strokeWidth: 1 }}
                        wrapperStyle={{ zIndex: 1000 }}
                        allowEscapeViewBox={{ x: true, y: true }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="maxTemp" stroke="#f97316" strokeWidth={2} fill="url(#gTemp)" name="Max (°C)" dot={false} isAnimationActive={false} />
                      <Area type="monotone" dataKey="minTemp" stroke="#fbbf24" strokeWidth={2} fill="none" name="Min (°C)" dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            )}

            {/* Fault/Anomaly Summary - Condensed */}
            {(faultEvents.length > 0 || anomalies.length > 0) && (
              <div className="max-w-3xl">
                <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
                  <div className="p-5 border-b border-slate-800 flex justify-between items-center">
                    <span className="text-base font-semibold flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-red-400" /> Issues Summary
                    </span>
                    <button onClick={() => setActiveTab('faults')} className="text-sm text-emerald-400 hover:underline font-medium">
                      View All →
                    </button>
                  </div>
                  <div className="divide-y divide-slate-800 max-h-80 overflow-y-auto">
                    {anomalies.slice(0, 5).map((a, i) => (
                      <div key={`a-${i}`} className="p-4 flex items-center gap-4 hover:bg-slate-800/30 cursor-pointer transition-colors" onClick={() => jumpToAnomaly(a)}>
                        <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-red-400 truncate">{a.description}</div>
                          <div className="text-xs text-slate-500">{a.timeStr.split(',')[1]} • {a.cells.length} cells</div>
                        </div>
                        <Eye className="w-4 h-4 text-slate-500 flex-shrink-0" />
                      </div>
                    ))}
                    {faultEvents.slice(0, 5).map(f => (
                      <div key={f.id} className="p-4 flex items-center gap-4 hover:bg-slate-800/30 transition-colors">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${f.severity === 3 ? 'bg-red-500' : f.severity === 2 ? 'bg-orange-500' : 'bg-amber-500'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{f.name}</div>
                          <div className="text-xs text-slate-500">{f.timeStr.split(',')[1]}</div>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${
                          f.severity === 3 ? 'bg-red-500/20 text-red-400' : f.severity === 2 ? 'bg-orange-500/20 text-orange-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>{f.severityText}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ==================== CHARTS ==================== */}
        {activeTab === 'charts' && (
          <>
            {!chartData || chartData.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-slate-400 text-lg">No chart data available. Please upload a BMS log file.</div>
              </div>
            ) : (
          <div className="space-y-6">
            {/* Zoom Controls */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4 space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400 font-semibold">Quick Presets:</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setChartZoom({ start: 0, end: 100 })}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                        chartZoom.start === 0 && chartZoom.end === 100
                          ? 'bg-cyan-500 text-white shadow-lg'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      Full View
                    </button>
                    <button
                      onClick={() => setChartZoom({ start: 0, end: 50 })}
                      className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-sm font-semibold transition-all"
                    >
                      First Half
                    </button>
                    <button
                      onClick={() => setChartZoom({ start: 50, end: 100 })}
                      className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-sm font-semibold transition-all"
                    >
                      Last Half
                    </button>
                    <button
                      onClick={() => setChartZoom({ start: 75, end: 100 })}
                      className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-sm font-semibold transition-all"
                    >
                      Last 25%
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">
                    Showing: <span className="text-white font-semibold">{zoomedChartData.length}</span> of {chartData.length} points
                  </span>
                </div>
              </div>

              {/* Zoom & Scroll Controls - Simple Preset Buttons Only (No Interactive Elements) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400 font-semibold">View Window:</span>
                  <span className="text-xs text-slate-500">
                    {chartZoom.start.toFixed(0)}% - {chartZoom.end.toFixed(0)}%
                  </span>
                </div>

                {/* Simple preset buttons with hardcoded values - NO calculations, NO dynamic updates */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setChartZoom({ start: 0, end: 100 })}
                    className={`px-3 py-2 rounded text-xs font-semibold transition-colors ${
                      chartZoom.start === 0 && chartZoom.end === 100
                        ? 'bg-blue-700 text-white hover:bg-blue-600'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Full View
                  </button>
                  <button
                    onClick={() => setChartZoom({ start: 0, end: 25 })}
                    className={`px-3 py-2 rounded text-xs font-semibold transition-colors ${
                      chartZoom.start === 0 && chartZoom.end === 25
                        ? 'bg-blue-700 text-white hover:bg-blue-600'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    First 25%
                  </button>
                  <button
                    onClick={() => setChartZoom({ start: 25, end: 50 })}
                    className={`px-3 py-2 rounded text-xs font-semibold transition-colors ${
                      chartZoom.start === 25 && chartZoom.end === 50
                        ? 'bg-blue-700 text-white hover:bg-blue-600'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Second 25%
                  </button>
                  <button
                    onClick={() => setChartZoom({ start: 50, end: 75 })}
                    className={`px-3 py-2 rounded text-xs font-semibold transition-colors ${
                      chartZoom.start === 50 && chartZoom.end === 75
                        ? 'bg-blue-700 text-white hover:bg-blue-600'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Third 25%
                  </button>
                  <button
                    onClick={() => setChartZoom({ start: 75, end: 100 })}
                    className={`px-3 py-2 rounded text-xs font-semibold transition-colors ${
                      chartZoom.start === 75 && chartZoom.end === 100
                        ? 'bg-blue-700 text-white hover:bg-blue-600'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Last 25%
                  </button>
                  <button
                    onClick={() => setChartZoom({ start: 40, end: 60 })}
                    className={`px-3 py-2 rounded text-xs font-semibold transition-colors ${
                      chartZoom.start === 40 && chartZoom.end === 60
                        ? 'bg-blue-700 text-white hover:bg-blue-600'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Middle 20%
                  </button>
                </div>
              </div>
            </div>

            <ChartCard title="Pack Voltage & State of Charge" icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={zoomedChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#475569" fontSize={11} tick={{fill: '#475569'}} />
                  <YAxis yAxisId="l" stroke="#10b981" fontSize={11} tickFormatter={(val) => `${val}V`} />
                  <YAxis yAxisId="r" orientation="right" stroke="#8b5cf6" fontSize={11} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />

                  {/* SOC reference lines */}
                  <ReferenceLine yAxisId="r" y={20} label={{ position: 'right', value: 'Low', fill: '#f59e0b', fontSize: 10 }} stroke="#f59e0b" strokeDasharray="3 3" />
                  <ReferenceLine yAxisId="r" y={80} label={{ position: 'right', value: 'High', fill: '#10b981', fontSize: 10 }} stroke="#10b981" strokeDasharray="3 3" />

                  {/* Date change markers - vertical lines showing when recording spans multiple dates */}
                  {dateChangeMarkers.map((marker, idx) => (
                    <ReferenceLine
                      key={`date-${idx}`}
                      x={marker.time}
                      stroke="#64748b"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      label={{
                        value: marker.label,
                        position: 'top',
                        fill: '#94a3b8',
                        fontSize: 11,
                        fontWeight: 'bold'
                      }}
                    />
                  ))}

                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: '12px' }}
                    cursor={{ stroke: '#475569', strokeWidth: 1 }}
                    wrapperStyle={{ zIndex: 1000 }}
                    allowEscapeViewBox={{ x: true, y: true }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="l" type="monotone" dataKey="packV" stroke="#10b981" dot={false} strokeWidth={2} name="Pack V" isAnimationActive={false} />
                  <Line yAxisId="r" type="monotone" dataKey="soc" stroke="#8b5cf6" dot={false} strokeWidth={2} name="SOC %" isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={`Cell Voltage Precision (${stats?.cellCount} cells)`} icon={<Activity className="w-4 h-4 text-cyan-400" />}>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={zoomedChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    {/* Glow effect for the Min/Max lines - Enhanced */}
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
                      <feMerge>
                        <feMergeNode in="blur"/>
                        <feMergeNode in="blur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                    {/* Drop shadow for emphasis */}
                    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
                      <feOffset dx="0" dy="0" result="offsetblur"/>
                      <feComponentTransfer>
                        <feFuncA type="linear" slope="0.8"/>
                      </feComponentTransfer>
                      <feMerge>
                        <feMergeNode/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#475569" fontSize={11} tick={{fill: '#475569'}} />
                  <YAxis
                    domain={['dataMin - 50', 'dataMax + 50']}
                    stroke="#475569"
                    fontSize={11}
                    tickFormatter={(val) => `${val}mV`}
                  />

                  {/* Threshold Lines */}
                  <ReferenceLine y={4200} label={{ position: 'right', value: 'OV', fill: '#ef4444', fontSize: 11 }} stroke="#ef4444" strokeDasharray="5 5" />
                  <ReferenceLine y={2800} label={{ position: 'right', value: 'UV', fill: '#ef4444', fontSize: 11 }} stroke="#ef4444" strokeDasharray="5 5" />

                  {/* Date change markers */}
                  {dateChangeMarkers.map((marker, idx) => (
                    <ReferenceLine
                      key={`date-${idx}`}
                      x={marker.time}
                      stroke="#64748b"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      label={{
                        value: marker.label,
                        position: 'top',
                        fill: '#94a3b8',
                        fontSize: 11,
                        fontWeight: 'bold'
                      }}
                    />
                  ))}

                  <Tooltip
                    trigger="axis"
                    isAnimationActive={false}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0].payload;

                      // Extract all cell voltages
                      const cellVoltages = [];
                      for (let i = 0; i < (stats?.cellCount || 0); i++) {
                        const cellKey = `cell${i}`;
                        if (data[cellKey] != null) {
                          cellVoltages.push({ cell: i + 1, voltage: data[cellKey] });
                        }
                      }

                      // Sort by voltage (descending)
                      cellVoltages.sort((a, b) => b.voltage - a.voltage);

                      return (
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 shadow-xl max-w-xs">
                          <div className="text-xs text-slate-400 mb-2 font-semibold">{data.time}</div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-4 border-b border-slate-700 pb-1.5">
                              <span className="text-emerald-400 font-semibold">Pack Max:</span>
                              <span className="text-emerald-400 font-bold">{data.maxCell}mV</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 border-b border-slate-700 pb-1.5">
                              <span className="text-blue-400 font-semibold">Pack Min:</span>
                              <span className="text-blue-400 font-bold">{data.minCell}mV</span>
                            </div>

                            {/* Show only top 5 and bottom 5 cells to keep tooltip compact */}
                            {cellVoltages.length > 10 ? (
                              <>
                                <div className="text-xs text-slate-500 mt-2 mb-1">Highest 5 Cells:</div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                                  {cellVoltages.slice(0, 5).map(({ cell, voltage }) => (
                                    <div key={cell} className="flex justify-between">
                                      <span className="text-slate-400">Cell #{cell}:</span>
                                      <span className="text-white font-mono">{voltage}mV</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="text-xs text-slate-500 mt-2 mb-1">Lowest 5 Cells:</div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                                  {cellVoltages.slice(-5).reverse().map(({ cell, voltage }) => (
                                    <div key={cell} className="flex justify-between">
                                      <span className="text-slate-400">Cell #{cell}:</span>
                                      <span className="text-white font-mono">{voltage}mV</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs mt-2">
                                {cellVoltages.map(({ cell, voltage }) => (
                                  <div key={cell} className="flex justify-between">
                                    <span className="text-slate-400">Cell #{cell}:</span>
                                    <span className="text-white font-mono">{voltage}mV</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                    cursor={{ stroke: '#475569', strokeWidth: 1 }}
                    wrapperStyle={{ zIndex: 1000 }}
                  />

                  {/* Pack Max and Min - Simplified for performance (no glow effects) */}
                  <Line
                    type="monotone"
                    dataKey="maxCell"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={false}
                    name="Pack Max"
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="minCell"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={false}
                    name="Pack Min"
                    connectNulls
                    isAnimationActive={false}
                  />

                  {/* Individual Cell Lines - Simplified rendering */}
                  {Array.from({ length: stats?.cellCount || 0 }, (_, i) => (
                    <Line
                      key={i}
                      type="monotone"
                      dataKey={`cell${i}`}
                      stroke={`hsl(${i * (360 / stats.cellCount)}, 70%, 60%)`}
                      dot={false}
                      strokeWidth={1.2}
                      opacity={0.6}
                      connectNulls
                      activeDot={false}
                      name={`Cell #${i+1}`}
                      isAnimationActive={false}
                      legendType="none"
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Cell Imbalance (Δ) - Balance Health Monitor" icon={<AlertTriangle className="w-4 h-4 text-red-400" />}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={zoomedChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#475569" fontSize={11} tick={{fill: '#475569'}} />
                  <YAxis stroke="#475569" fontSize={11} tickFormatter={(val) => `${val}mV`} />

                  {/* GOOD threshold: <30mV (GREEN) */}
                  <ReferenceLine y={30} label={{ position: 'right', value: 'Good <30mV', fill: '#10b981', fontSize: 10 }} stroke="#10b981" strokeDasharray="3 3" opacity={0.5} />
                  {/* MARGINAL threshold: 30-150mV (YELLOW) */}
                  <ReferenceLine y={150} label={{ position: 'right', value: 'Warning 150mV', fill: '#f59e0b', fontSize: 10 }} stroke="#f59e0b" strokeDasharray="3 3" />

                  <Tooltip
                    trigger="axis"
                    isAnimationActive={false}
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: '12px' }}
                    cursor={{ stroke: '#475569', strokeWidth: 1 }}
                    wrapperStyle={{ zIndex: 1000 }}
                    allowEscapeViewBox={{ x: true, y: true }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0].payload;
                      const value = data.cellDiff;

                      // Find active faults at this timestamp
                      const ts = new Date(data.fullTime).getTime();
                      const activeFaults = faultEvents.filter(f => {
                        if (!f.startTime) return false;
                        const startTs = f.startTime.getTime();
                        const endTs = f.endTime ? f.endTime.getTime() : Date.now();
                        return ts >= startTs && ts <= endTs;
                      });

                      let statusColor = '#10b981';
                      let statusText = 'GOOD';
                      if (value >= 150) {
                        statusColor = '#ef4444';
                        statusText = 'BAD';
                      } else if (value >= 30) {
                        statusColor = '#f59e0b';
                        statusText = 'Monitor';
                      }

                      return (
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 shadow-xl">
                          <div className="text-xs text-slate-400 mb-2">{data.time}</div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-300">Δ mV:</span>
                              <span className="font-bold" style={{ color: statusColor }}>
                                {value}mV ({statusText})
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-300">Status:</span>
                              <span className={`font-semibold ${
                                data.systemState === 'Charging' ? 'text-emerald-400' :
                                data.systemState === 'Discharging' ? 'text-cyan-400' : 'text-slate-400'
                              }`}>
                                {data.systemState || 'Standby'}
                              </span>
                            </div>
                            {activeFaults.length > 0 && (
                              <div className="border-t border-slate-700 pt-2 mt-2">
                                <div className="text-xs text-red-400 font-semibold mb-1">Active Faults:</div>
                                <div className="space-y-0.5">
                                  {activeFaults.slice(0, 3).map((f, i) => (
                                    <div key={i} className="text-xs text-red-300">
                                      • {f.name} (Lvl {f.severity})
                                    </div>
                                  ))}
                                  {activeFaults.length > 3 && (
                                    <div className="text-xs text-red-400">
                                      +{activeFaults.length - 3} more
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            {activeFaults.length === 0 && (
                              <div className="flex items-center gap-2 text-xs text-emerald-400">
                                <CheckCircle className="w-3 h-3" />
                                <span>No Active Faults</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  />
                  {/* Multi-layer line with color-coded segments */}
                  <Line
                    type="monotone"
                    dataKey="cellDiff"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={false}
                    name="Δ mV (Max-Min)"
                    connectNulls
                    isAnimationActive={false}
                  />
                  {/* Overlay data with conditional colors - this creates the effect */}
                  {zoomedChartData.map((d, i) => {
                    if (!d.cellDiff) return null;
                    let color = '#10b981'; // Green (GOOD)
                    if (d.cellDiff >= 150) color = '#ef4444'; // Red (BAD)
                    else if (d.cellDiff >= 30) color = '#f59e0b'; // Yellow (MARGINAL)

                    return (
                      <Line
                        key={`segment-${i}`}
                        data={[d]}
                        type="monotone"
                        dataKey="cellDiff"
                        stroke={color}
                        strokeWidth={3}
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                        legendType="none"
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
            )}
          </>
        )}

        {/* ==================== FAULTS ==================== */}
        {activeTab === 'faults' && (
          <div className="space-y-6 overflow-x-hidden">
            {/* Fault Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                <div className="text-sm text-slate-400 uppercase mb-3">Total Faults</div>
                <div className="text-3xl font-bold text-white">{faultEvents.length}</div>
                <div className="text-sm text-slate-400 mt-2">All severity levels</div>
              </div>
              <div className="bg-red-950/30 rounded-xl border border-red-800 p-6">
                <div className="text-sm text-red-400 uppercase mb-3">Level 3 (Critical)</div>
                <div className="text-3xl font-bold text-red-400">{faultEvents.filter(f => f.severity === 3).length}</div>
                <div className="text-sm text-red-300/60 mt-2">Highest severity</div>
              </div>
              <div className="bg-orange-950/30 rounded-xl border border-orange-800 p-6">
                <div className="text-sm text-orange-400 uppercase mb-3">Level 2 (Warning)</div>
                <div className="text-3xl font-bold text-orange-400">{faultEvents.filter(f => f.severity === 2).length}</div>
                <div className="text-sm text-orange-300/60 mt-2">Moderate severity</div>
              </div>
              <div className="bg-amber-950/30 rounded-xl border border-amber-800 p-6">
                <div className="text-sm text-amber-400 uppercase mb-3">Level 1 (Info)</div>
                <div className="text-3xl font-bold text-amber-400">{faultEvents.filter(f => f.severity === 1).length}</div>
                <div className="text-sm text-amber-300/60 mt-2">Informational</div>
              </div>
            </div>

            {/* Anomalies Section */}
            {anomalies.length > 0 && (
              <div className="bg-red-950/20 rounded-xl border border-red-800">
                <div className="p-5 border-b border-red-800/50">
                  <h2 className="text-lg font-semibold flex items-center gap-2 text-red-400">
                    <Flag className="w-5 h-5" /> Data Anomalies ({anomalies.length})
                    {/* Z-Score Info Tooltip */}
                    <div className="group relative">
                      <Info className="w-4 h-4 text-slate-400 hover:text-cyan-400 cursor-help transition-colors" />
                      <div className="absolute left-0 top-6 w-96 bg-slate-900 border border-cyan-500/30 rounded-lg p-4 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                        <div className="text-sm font-bold text-cyan-400 mb-2">📊 Hybrid Anomaly Detection System</div>
                        <div className="text-xs text-slate-300 space-y-2">
                          <p><span className="font-semibold text-white">Industry-Calibrated Thresholds:</span> Alerts trigger only when BOTH statistical (Z-score) AND physical (voltage) thresholds are exceeded.</p>
                          <div className="bg-slate-800/50 rounded p-2 space-y-1">
                            <div className="text-emerald-400">&lt;80mV: Normal operation (no alerts)</div>
                            <div className="text-amber-400">80-100mV + Z&gt;2.0: Monitor trend</div>
                            <div className="text-orange-400">100-200mV + Z&gt;2.5: Early imbalance</div>
                            <div className="text-red-400">200-300mV + Z&gt;3.0: Degradation</div>
                            <div className="text-red-500 font-bold">&gt;300mV: Dangerous imbalance</div>
                          </div>
                          <p className="text-slate-400 italic">Prevents false positives: A 4mV deviation (even with Z=2.29) is ignored as normal manufacturing variance. Alerts only trigger at 80+ mV deviations.</p>
                        </div>
                      </div>
                    </div>
                  </h2>
                  <p className="text-sm text-red-300/70 mt-2">These readings are outside normal ranges - includes absolute threshold violations and statistical outliers (Z-score)</p>
                </div>
                <div className="divide-y divide-red-800/30 max-h-96 overflow-y-auto overflow-x-hidden">
                  {anomalies.map((a, i) => (
                    <div key={i} className="p-5 hover:bg-red-900/10 cursor-pointer transition-colors" onClick={() => jumpToAnomaly(a)}>
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                          <AlertTriangle className="w-5 h-5 text-red-400" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-red-400 text-base">{a.description}</div>
                          <div className="text-sm text-slate-400 mt-1">{a.timeStr}</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {a.cells.slice(0, 12).map((c, j) => (
                              <span key={j} className="text-sm px-3 py-1.5 bg-red-900/50 text-red-300 rounded font-mono">
                                Cell {c.cell}: {c.voltage}mV
                              </span>
                            ))}
                            {a.cells.length > 12 && <span className="text-sm text-red-400 px-3 py-1.5">+{a.cells.length - 12} more cells</span>}
                          </div>
                        </div>
                        <button className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm flex items-center gap-2 transition-colors">
                          <Eye className="w-4 h-4" /> View in Snapshot
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fault Events */}
            {faultEvents.length > 0 ? (
              <div className="bg-slate-900/50 rounded-xl border border-slate-800">
                <div className="p-5 border-b border-slate-800">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Clock className="w-5 h-5 text-orange-400" /> BMS Fault Events ({faultEvents.length})
                  </h2>
                  <p className="text-sm text-slate-400 mt-2">Detailed fault information with system state, statistics, and relay status</p>
                </div>
                <div className="divide-y divide-slate-800 max-h-[70vh] overflow-y-auto overflow-x-hidden">
                  {faultEvents.map(f => (
                    <div key={f.id} className={`p-6 ${f.severity === 3 ? 'bg-red-950/10' : f.severity === 2 ? 'bg-orange-950/10' : 'bg-amber-950/10'} hover:bg-slate-800/30 transition-colors`}>
                      <div className="flex items-start gap-4 mb-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          f.severity === 3 ? 'bg-red-500/20 ring-2 ring-red-500/30' :
                          f.severity === 2 ? 'bg-orange-500/20 ring-2 ring-orange-500/30' :
                          'bg-amber-500/20 ring-2 ring-amber-500/30'
                        }`}>
                          <AlertTriangle className={`w-6 h-6 ${f.severity === 3 ? 'text-red-400' : f.severity === 2 ? 'text-orange-400' : 'text-amber-400'}`} />
                        </div>
                        <div className="flex-1">
                          <div className="text-lg font-bold text-white">{f.name}</div>
                          <div className="text-sm text-slate-400 font-mono mt-1">Code: {f.code}</div>
                          {f.ongoing && (
                            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/20 text-red-400 text-xs rounded-full border border-red-500/30">
                              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> ONGOING FAULT
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className={`text-base font-bold px-4 py-2 rounded-lg ${
                            f.severity === 3 ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                            f.severity === 2 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                            'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}>
                            {f.severityText}
                          </div>
                          <div className="text-sm text-slate-400 font-mono mt-3 space-y-1">
                            <div><span className="text-slate-500">Start:</span> {f.timeStr}</div>
                            {f.endTime && <div><span className="text-slate-500">End:</span> {f.endTime.toLocaleString()}</div>}
                          </div>
                          {f.duration != null && (
                            <div className={`text-sm font-bold mt-2 px-3 py-1 rounded ${f.ongoing ? 'bg-red-500/10 text-red-400' : 'bg-slate-700 text-slate-300'}`}>
                              ⏱ {fmtDuration(f.duration)}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-black/30 rounded-xl p-5 space-y-5">
                        {/* Snapshot at fault start */}
                        <div>
                          <div className="text-sm text-slate-400 mb-3 font-semibold flex items-center gap-2">
                            <Camera className="w-4 h-4 text-cyan-400" /> System State at Fault Start
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 text-sm">
                            <SnapBox label="Pack V" value={`${fmt(f.snapshot.packVoltage)}V`} />
                            <SnapBox label="Current" value={`${fmt(f.snapshot.current, 1)}A`} />
                            <SnapBox label="Shown SOC" value={`${fmt(f.snapshot.soc)}%`} />
                            <SnapBox label="Real SOC" value={`${fmt(f.snapshot.realSoc)}%`} />
                            <SnapBox label="SOH" value={`${fmt(f.snapshot.soh)}%`} />
                            <SnapBox label="State" value={f.snapshot.systemState || '—'} />
                            <SnapBox label="Cell Δ" value={`${f.snapshot.cellDiff != null ? f.snapshot.cellDiff.toFixed(0) : '—'}mV`} />
                            <SnapBox label="Max Cell V" value={`${f.snapshot.maxCellV ?? '—'}mV (${f.snapshot.maxCellId ?? '—'})`} />
                            <SnapBox label="Min Cell V" value={`${f.snapshot.minCellV ?? '—'}mV (${f.snapshot.minCellId ?? '—'})`} />
                            <SnapBox label="Max Temp" value={f.snapshot.maxTemp != null ? `${fmt(f.snapshot.maxTemp)}°C (${f.snapshot.maxTempId ?? '—'})` : '—'} />
                            <SnapBox label="Min Temp" value={f.snapshot.minTemp != null ? `${fmt(f.snapshot.minTemp)}°C (${f.snapshot.minTempId ?? '—'})` : '—'} />
                            <SnapBox label="Temp Δ" value={f.snapshot.tempDiff != null ? `${fmt(f.snapshot.tempDiff)}°C` : '—'} />
                            <SnapBox label="SW1" value={f.snapshot.sw1 || '—'} />
                            <SnapBox label="SW2" value={f.snapshot.sw2 || '—'} />
                            <SnapBox label="DI1" value={f.snapshot.di1 || '—'} />
                            <SnapBox label="DI2" value={f.snapshot.di2 || '—'} />
                            <SnapBox label="Heartbeat" value={f.snapshot.heartbeat || '—'} />
                            <SnapBox label="Power V" value={f.snapshot.powerVolt ? `${fmt(f.snapshot.powerVolt)}mV` : '—'} />
                            <SnapBox label="Sys Insul" value={formatInsulation(f.snapshot.insulationRes)} />
                            <SnapBox label="Pos Insul" value={formatInsulation(f.snapshot.posInsulation)} />
                            <SnapBox label="Neg Insul" value={formatInsulation(f.snapshot.negInsulation)} />
                            <SnapBox label="Reset Src" value={f.snapshot.resetSource || '—'} />
                            <SnapBox label="Wakeup" value={f.snapshot.wakeupSignal || '—'} />
                            {f.snapshot.accVoltage && <SnapBox label="Acc V" value={`${fmt(f.snapshot.accVoltage)}V`} />}
                            {f.snapshot.chgSelfDiagFault && <SnapBox label="Chg Diag" value={f.snapshot.chgSelfDiagFault} />}
                            {f.snapshot.dchgSelfDiagFault && <SnapBox label="Dchg Diag" value={f.snapshot.dchgSelfDiagFault} />}
                          </div>
                        </div>

                        {/* Statistics during fault (if fault ended) */}
                        {f.stats && (
                          <div className="pt-5 border-t border-slate-700">
                            <div className="text-sm text-slate-400 mb-3 font-semibold flex items-center gap-2">
                              <TrendingUp className="w-4 h-4 text-violet-400" /> Statistics During Fault Duration
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 text-sm">
                              {f.stats.cellV && (
                                <>
                                  <SnapBox label="Cell V Min" value={`${fmt(f.stats.cellV.min)}mV`} />
                                  <SnapBox label="Cell V Max" value={`${fmt(f.stats.cellV.max)}mV`} />
                                  <SnapBox label="Cell V Avg" value={`${fmt(f.stats.cellV.avg)}mV`} />
                                </>
                              )}
                              {f.stats.temp && (
                                <>
                                  <SnapBox label="Temp Min" value={`${fmt(f.stats.temp.min)}°C`} />
                                  <SnapBox label="Temp Max" value={`${fmt(f.stats.temp.max)}°C`} />
                                  <SnapBox label="Temp Avg" value={`${fmt(f.stats.temp.avg)}°C`} />
                                </>
                              )}
                              {f.stats.insulation && (
                                <>
                                  <SnapBox label="Sys Ins Min" value={formatInsulation(f.stats.insulation.min)} />
                                  <SnapBox label="Sys Ins Max" value={formatInsulation(f.stats.insulation.max)} />
                                  <SnapBox label="Sys Ins Avg" value={formatInsulation(f.stats.insulation.avg)} />
                                </>
                              )}
                              {f.stats.posInsulation && (
                                <>
                                  <SnapBox label="Pos Ins Min" value={formatInsulation(f.stats.posInsulation.min)} />
                                  <SnapBox label="Pos Ins Avg" value={formatInsulation(f.stats.posInsulation.avg)} />
                                </>
                              )}
                              {f.stats.negInsulation && (
                                <>
                                  <SnapBox label="Neg Ins Min" value={formatInsulation(f.stats.negInsulation.min)} />
                                  <SnapBox label="Neg Ins Avg" value={formatInsulation(f.stats.negInsulation.avg)} />
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Relay states */}
                        {f.snapshot.relays && Object.keys(f.snapshot.relays).length > 0 && (
                          <div className="pt-5 border-t border-slate-700">
                            <div className="text-sm text-slate-400 mb-3 font-semibold flex items-center gap-2">
                              <Zap className="w-4 h-4 text-amber-400" /> Relay States at Fault Start
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {ALL_RELAYS.map(id => {
                                const state = f.snapshot.relays[id] || 'OFF';
                                return (
                                  <div key={id} className={`text-sm px-4 py-3 rounded-lg flex items-center justify-between border transition-all ${
                                    state === 'ON'
                                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ring-2 ring-emerald-500/20'
                                      : 'bg-slate-800/50 text-slate-400 border-slate-700'
                                  }`}>
                                    <div className="flex items-center gap-3">
                                      <div className={`w-3 h-3 rounded-full ${
                                        state === 'ON' ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 'bg-slate-600'
                                      }`} />
                                      <span className="font-semibold">{relayConfig[id] || RELAY_NAMES[id]}</span>
                                    </div>
                                    <span className="font-bold text-xs">{state}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : anomalies.length === 0 && (
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-12 text-center">
                <CheckCircle className="w-16 h-16 mx-auto mb-4 text-emerald-500" />
                <h2 className="text-xl font-semibold text-emerald-400">No Issues Detected</h2>
                <p className="text-slate-500">No faults or anomalies in this time range.</p>
              </div>
            )}
          </div>
        )}

        {/* ==================== SNAPSHOT ==================== */}
        {activeTab === 'snapshot' && currentSnap && (
          <div className="space-y-4">
            {/* Search & Playback */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-1.5">
                  <Search className="w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Jump to time (e.g. 08:37)"
                    value={searchTime}
                    onChange={(e) => setSearchTime(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && jumpToTime(searchTime)}
                    className="bg-transparent border-none text-sm w-40 focus:outline-none"
                  />
                </div>
                <button onClick={() => jumpToTime(searchTime)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm">Go</button>

                {anomalies.length > 0 && (
                  <button
                    onClick={() => jumpToAnomaly(anomalies[0])}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm flex items-center gap-1"
                  >
                    <Flag className="w-3 h-3" /> Jump to Anomaly
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button onClick={() => setPlaybackIdx(0)} className="p-2 hover:bg-slate-800 rounded-lg"><SkipBack className="w-4 h-4" /></button>
                <button onClick={() => setPlaybackIdx(Math.max(0, playbackIdx - 10))} className="px-2 py-1 text-xs hover:bg-slate-800 rounded">−10</button>
                <button onClick={() => setIsPlaying(!isPlaying)} className={`p-2 rounded-lg ${isPlaying ? 'bg-red-600' : 'bg-emerald-600'}`}>
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button onClick={() => setPlaybackIdx(Math.min(filteredData.length - 1, playbackIdx + 10))} className="px-2 py-1 text-xs hover:bg-slate-800 rounded">+10</button>
                <button onClick={() => setPlaybackIdx(filteredData.length - 1)} className="p-2 hover:bg-slate-800 rounded-lg"><SkipForward className="w-4 h-4" /></button>

                {/* Playback Speed Controls */}
                <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg px-2 py-1 border border-slate-700">
                  <span className="text-xs text-slate-400 mr-1">Speed:</span>
                  {[0.25, 0.5, 1, 2, 4].map(speed => (
                    <button
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className={`px-2 py-1 text-xs rounded transition-all ${
                        playbackSpeed === speed
                          ? 'bg-cyan-600 text-white font-bold'
                          : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>

                <div className="flex-1">
                  <input type="range" min={0} max={filteredData.length - 1} value={playbackIdx}
                    onChange={e => setPlaybackIdx(+e.target.value)} className="w-full accent-emerald-500" />
                </div>

                <div className="text-right min-w-[180px]">
                  <div className="font-mono text-sm">{fmtTime(currentSnap.time)}</div>
                  <div className="text-xs text-slate-500">{playbackIdx + 1} / {filteredData.length}</div>
                </div>
              </div>
            </div>

            {/* Anomaly Warning */}
            {currentSnap.cells && Object.values(currentSnap.cells).some(v => v > 5000) && (
              <div className="bg-red-950/50 border border-red-700 rounded-xl p-4 flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-red-400" />
                <div>
                  <div className="font-semibold text-red-400">⚠️ Anomalous Data at This Timestamp</div>
                  <div className="text-sm text-red-300/70">Some cell voltages show abnormal values (sensor error or communication issue)</div>
                </div>
              </div>
            )}

            {/* LARGE STATUS PILL */}
            <div className="mb-6">
              <div className={`relative overflow-hidden rounded-2xl p-8 ${
                currentSnap.systemState === 'Charging'
                  ? 'bg-gradient-to-r from-emerald-900/40 to-emerald-800/40 border-2 border-emerald-500/50'
                  : currentSnap.systemState === 'Discharging'
                  ? 'bg-gradient-to-r from-cyan-900/40 to-cyan-800/40 border-2 border-cyan-500/50'
                  : 'bg-gradient-to-r from-slate-900/40 to-slate-800/40 border-2 border-slate-700'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                      currentSnap.systemState === 'Charging'
                        ? 'bg-emerald-500/20 ring-4 ring-emerald-500/30'
                        : currentSnap.systemState === 'Discharging'
                        ? 'bg-cyan-500/20 ring-4 ring-cyan-500/30'
                        : 'bg-slate-500/20 ring-4 ring-slate-500/30'
                    }`}>
                      <Zap className={`w-10 h-10 ${
                        currentSnap.systemState === 'Charging' ? 'text-emerald-400' :
                        currentSnap.systemState === 'Discharging' ? 'text-cyan-400' : 'text-slate-400'
                      }`} />
                    </div>
                    <div>
                      <div className="text-sm text-slate-400 uppercase tracking-wider mb-1">System Status</div>
                      <div className={`text-4xl font-bold ${
                        currentSnap.systemState === 'Charging' ? 'text-emerald-400' :
                        currentSnap.systemState === 'Discharging' ? 'text-cyan-400' : 'text-white'
                      }`}>
                        {currentSnap.systemState || 'UNKNOWN'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <div className="text-3xl font-bold text-white font-mono">{fmt(currentSnap.packVoltage)}V</div>
                    <div className="text-lg text-slate-300 font-mono">{currentSnap.current >= 0 ? '+' : ''}{fmt(currentSnap.current, 1)}A</div>
                    <div className="text-sm text-slate-400 font-mono">SOC: {fmt(currentSnap.soc)}% | SOH: {fmt(currentSnap.soh)}%</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* System State Details */}
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                <h3 className="text-base text-slate-300 mb-5 flex items-center gap-2 font-semibold">
                  <Camera className="w-5 h-5 text-cyan-400" /> System Details
                </h3>
                <div className="space-y-1 text-sm font-mono">
                  <Row label="Pack V" value={`${fmt(currentSnap.packVoltage)}V`} />
                  <Row label="Current" value={`${fmt(currentSnap.current, 1)}A`} />
                  <Row label="Shown SOC" value={`${fmt(currentSnap.soc)}%`} />
                  <Row label="Real SOC" value={`${fmt(currentSnap.realSoc)}%`} />
                  <Row label="SOH" value={`${fmt(currentSnap.soh)}%`} />
                  <Row label="Cell Δ" value={`${currentSnap.cellDiff != null ? currentSnap.cellDiff.toFixed(0) : '—'}mV`} />
                  <Row label="Max Cell" value={`${currentSnap.maxCellV != null ? currentSnap.maxCellV.toFixed(0) : '—'}mV (${currentSnap.maxCellId ?? '—'})`} />
                  <Row label="Min Cell" value={`${currentSnap.minCellV != null ? currentSnap.minCellV.toFixed(0) : '—'}mV (${currentSnap.minCellId ?? '—'})`} />
                  <div className="border-t border-slate-700 pt-2 mt-2 space-y-1.5">
                    <Row label="Sys Insul" value={formatInsulation(currentSnap.insulationRes)} />
                    <Row label="Pos Insul" value={formatInsulation(currentSnap.posInsulation)} />
                    <Row label="Neg Insul" value={formatInsulation(currentSnap.negInsulation)} />
                  </div>
                  <div className="border-t border-slate-700 pt-2 mt-2 space-y-1.5">
                    <Row label="HV1 (Batt)" value={currentSnap.hv1 != null ? `${fmt(currentSnap.hv1, 1)}V` : '—'} />
                    <Row label="HV2 (Load)" value={currentSnap.hv2 != null ? `${fmt(currentSnap.hv2, 1)}V` : '—'} />
                    <Row label="HV3" value={currentSnap.hv3 != null ? `${fmt(currentSnap.hv3, 1)}V` : '—'} />
                    <Row label="Bus Δ (HV1-HV2)" value={
                      currentSnap.hv1 != null && currentSnap.hv2 != null
                        ? `${fmt(currentSnap.hv1 - currentSnap.hv2, 2)}V`
                        : '—'
                    } />
                  </div>
                  <div className="border-t border-slate-700 pt-2 mt-2 space-y-1.5">
                    <Row label="SW1" value={currentSnap.sw1 ?? '—'} />
                    <Row label="SW2" value={currentSnap.sw2 ?? '—'} />
                    <Row label="DI1" value={currentSnap.di1 ?? '—'} />
                    <Row label="DI2" value={currentSnap.di2 ?? '—'} />
                    <Row label="Heartbeat" value={currentSnap.heartbeat ?? '—'} />
                    <Row label="Power V" value={currentSnap.powerVolt ? `${fmt(currentSnap.powerVolt)}mV` : '—'} />
                  </div>
                </div>
              </div>

              {/* Relay States */}
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                <h3 className="text-base text-slate-300 mb-5 flex items-center gap-2 font-semibold">
                  <Zap className="w-5 h-5 text-amber-400" /> Relay Status
                </h3>
                <div className="space-y-3">
                  {ALL_RELAYS.map(id => {
                    const state = currentSnap.relays?.[id] || 'OFF';
                    return (
                      <div key={id} className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3 transition-all hover:bg-slate-800">
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full transition-all flex items-center justify-center ${
                            state === 'ON' ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50 ring-2 ring-emerald-400/30' :
                            state === 'STICKING' ? 'bg-red-500 shadow-lg shadow-red-500/50 ring-2 ring-red-400/30' :
                            'bg-slate-600'
                          }`}>
                            {state === 'ON' && <div className="w-2 h-2 bg-white rounded-full animate-pulse" />}
                            {state === 'STICKING' && <AlertTriangle className="w-3 h-3 text-white animate-pulse" />}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-white">{relayConfig[id]}</div>
                            <div className="text-xs text-slate-500">{id}</div>
                          </div>
                        </div>
                        <div className={`text-sm font-bold px-3 py-1.5 rounded-md transition-all ${
                          state === 'ON' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          state === 'STICKING' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                          'bg-slate-700 text-slate-400'
                        }`}>
                          {state}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cell Voltages with Heat Map */}
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 md:col-span-2">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base text-slate-300 flex items-center gap-2 font-semibold">
                    <Battery className="w-5 h-5 text-emerald-400" /> Cell Voltages (mV) - Heat Map
                  </h3>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded bg-orange-900/60 text-orange-200">LOW</span>
                    <span className="px-2.5 py-1 rounded bg-yellow-900/50 text-yellow-200">BELOW</span>
                    <span className="px-2.5 py-1 rounded bg-emerald-900/50 text-emerald-200">GOOD</span>
                    <span className="px-2.5 py-1 rounded bg-cyan-900/50 text-cyan-200">ABOVE</span>
                    <span className="px-2.5 py-1 rounded bg-blue-900/60 text-blue-200">HIGH</span>
                  </div>
                </div>
                <div className="grid grid-cols-6 md:grid-cols-8 gap-2 text-sm font-mono max-h-96 overflow-y-auto p-2">
                  {(() => {
                    const cells = Object.entries(currentSnap.cells || {});
                    // Filter out corrupt sensor readings (>5000mV or <1000mV)
                    const validCells = cells.filter(([, v]) => v > 1000 && v < 5000);
                    const voltages = validCells.map(([, v]) => v);
                    const minV = voltages.length > 0 ? Math.min(...voltages) : 0;
                    const maxV = voltages.length > 0 ? Math.max(...voltages) : 0;
                    const avgV = voltages.length > 0 ? voltages.reduce((a, b) => a + b, 0) / voltages.length : 0;

                    return validCells.map(([k, v]) => {
                      const isBalancing = currentSnap.balancing?.[k] === 'ACTIVE';
                      const heatMap = getVoltageHeatMap(v, minV, maxV, avgV);
                      return (
                        <div key={k} className={`px-3 py-2.5 rounded relative border ${heatMap.bg} ${heatMap.text} border-slate-700 hover:ring-2 hover:ring-cyan-500 transition-all`} title={`Cell ${k}: ${v}mV (${heatMap.label})`}>
                          <div className="font-bold text-center text-sm">{k}</div>
                          <div className="text-center text-sm mt-1">{v}</div>
                          {isBalancing && <span className="absolute top-1 right-1 w-2 h-2 bg-cyan-400 rounded-full animate-pulse" title="Balancing" />}
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-3 gap-4 text-sm px-2">
                  <div><span className="text-slate-500">Min:</span> <span className="font-mono text-orange-400">{currentSnap.minCellV ?? '—'}mV</span></div>
                  <div><span className="text-slate-500">Max:</span> <span className="font-mono text-blue-400">{currentSnap.maxCellV ?? '—'}mV</span></div>
                  <div><span className="text-slate-500">Δ:</span> <span className="font-mono text-red-400">{currentSnap.cellDiff ?? '—'}mV</span></div>
                </div>
              </div>

              {/* Temperatures */}
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                <h3 className="text-base text-slate-300 mb-5 flex items-center gap-2 font-semibold">
                  <ThermometerSun className="w-5 h-5 text-orange-400" /> Temperatures (°C)
                </h3>
                <div className="grid grid-cols-3 gap-2 text-sm font-mono max-h-80 overflow-y-auto p-2">
                  {Object.entries(currentSnap).filter(([k]) => /^temp\d+$/.test(k)).map(([k, v]) => (
                    <div key={k} className={`px-3 py-2.5 rounded text-center border ${
                      v > 45 ? 'bg-red-900/60 text-red-200 border-red-700' :
                      v > 35 ? 'bg-amber-900/60 text-amber-200 border-amber-700' :
                      v < 15 ? 'bg-cyan-900/60 text-cyan-200 border-cyan-700' :
                      'bg-slate-800 text-slate-300 border-slate-700'
                    }`}>
                      <div className="font-bold text-sm">{k.replace('temp', 'T')}</div>
                      <div className="text-sm mt-1">{v}°</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-2 gap-3 text-sm px-2">
                  <div><span className="text-slate-500">Max:</span> <span className="font-mono text-red-400">{currentSnap.maxTemp != null ? `${fmt(currentSnap.maxTemp)}°C (${currentSnap.maxTempId ?? '—'})` : '—'}</span></div>
                  <div><span className="text-slate-500">Min:</span> <span className="font-mono text-cyan-400">{currentSnap.minTemp != null ? `${fmt(currentSnap.minTemp)}°C (${currentSnap.minTempId ?? '—'})` : '—'}</span></div>
                </div>
              </div>

              {/* Diagnostic Faults */}
              {(currentSnap.chgSelfDiagFault || currentSnap.dchgSelfDiagFault || currentSnap.chgDiagFault || currentSnap.dchgDiagFault) && (
                <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-5">
                  <h3 className="text-base text-slate-300 mb-4 flex items-center gap-2 font-semibold">
                    <AlertTriangle className="w-5 h-5 text-red-400" /> Diagnostic Faults
                  </h3>
                  <div className="space-y-2 text-sm">
                    {currentSnap.chgSelfDiagFault && <Row label="Chg Self-Diag" value={currentSnap.chgSelfDiagFault} highlight="red" />}
                    {currentSnap.dchgSelfDiagFault && <Row label="Dchg Self-Diag" value={currentSnap.dchgSelfDiagFault} highlight="red" />}
                    {currentSnap.chgDiagFault && <Row label="Chg Diag Flag" value={currentSnap.chgDiagFault} highlight="orange" />}
                    {currentSnap.dchgDiagFault && <Row label="Dchg Diag Flag" value={currentSnap.dchgDiagFault} highlight="orange" />}
                  </div>
                </div>
              )}
            </div>

            {/* Energy & Charging Info Row */}
            {(currentSnap.chargerConnected || currentSnap.accChargedEnergy || currentSnap.accDischargedEnergy) && (
              <div className="grid md:grid-cols-2 gap-6 mt-6">
                {/* Energy Tracking */}
                {(currentSnap.accChargedEnergy || currentSnap.accDischargedEnergy) && (
                  <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                    <h3 className="text-base text-slate-300 mb-5 flex items-center gap-2 font-semibold">
                      <Activity className="w-5 h-5 text-violet-400" /> Energy Tracking
                    </h3>
                    <div className="grid grid-cols-2 gap-5">
                      <div className="p-3">
                        <div className="text-sm text-slate-400 uppercase mb-2">Charged</div>
                        <div className="text-xl font-bold text-emerald-400">{fmt(currentSnap.chargedEnergy, 1)} AH</div>
                        <div className="text-sm text-slate-500 mt-1">Total: {fmt(currentSnap.accChargedEnergy, 0)} AH</div>
                      </div>
                      <div className="p-3">
                        <div className="text-sm text-slate-400 uppercase mb-2">Discharged</div>
                        <div className="text-xl font-bold text-orange-400">{fmt(currentSnap.dischargedEnergy, 1)} AH</div>
                        <div className="text-sm text-slate-500 mt-1">Total: {fmt(currentSnap.accDischargedEnergy, 0)} AH</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Charging Status */}
                {currentSnap.chargerConnected && (
                  <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-5">
                    <h3 className="text-base text-slate-300 mb-4 flex items-center gap-2 font-semibold">
                      <Zap className="w-5 h-5 text-cyan-400" /> Charging Status
                    </h3>
                    <div className="space-y-2 text-sm">
                      <Row label="Charger" value={currentSnap.chargerConnected || '—'} highlight="emerald" />
                      <Row label="Req V/I" value={`${fmt(currentSnap.chargeReqVolt)}V / ${fmt(currentSnap.chargeReqCurr)}A`} />
                      <Row label="Out V/I" value={`${fmt(currentSnap.chargerOutputVolt)}V / ${fmt(currentSnap.chargerOutputCurr)}A`} />
                      <Row label="Time" value={currentSnap.chargingTime || '—'} />
                      {(currentSnap.chargerPortTemp1 || currentSnap.chargerPortTemp2 || currentSnap.chargerPortTemp3) && (
                        <div className="border-t border-slate-700 pt-2 mt-2">
                          <div className="text-xs text-slate-500 mb-1">Port Temps</div>
                          <div className="flex gap-2">
                            {currentSnap.chargerPortTemp1 && <span className="text-xs bg-slate-800 px-2 py-1 rounded">T1: {fmt(currentSnap.chargerPortTemp1)}°C</span>}
                            {currentSnap.chargerPortTemp2 && <span className="text-xs bg-slate-800 px-2 py-1 rounded">T2: {fmt(currentSnap.chargerPortTemp2)}°C</span>}
                            {currentSnap.chargerPortTemp3 && <span className="text-xs bg-slate-800 px-2 py-1 rounded">T3: {fmt(currentSnap.chargerPortTemp3)}°C</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==================== RAW DATA ==================== */}
        {activeTab === 'raw' && (
          <div className="space-y-4">
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" /> Raw Sheet Data
              </h2>
              <div className="space-y-2">
                {Object.keys(rawSheets).map(name => (
                  <div key={name} className="border border-slate-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedSheets(prev => ({ ...prev, [name]: !prev[name] }))}
                      className="w-full p-3 flex items-center justify-between bg-slate-800/50 hover:bg-slate-800 transition"
                    >
                      <div className="flex items-center gap-2">
                        {expandedSheets[name] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="font-mono text-sm">{name}</span>
                        <span className="text-xs text-slate-500">({rawSheets[name].length} rows)</span>
                      </div>
                    </button>
                    {expandedSheets[name] && (
                      <div className="p-4 bg-black/20">
                        {/* Show All Toggle */}
                        {rawSheets[name].length > 50 && (
                          <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-700">
                            <div className="text-sm text-slate-400">
                              Showing {showAllRows[name] ? rawSheets[name].length : Math.min(50, rawSheets[name].length)} of {rawSheets[name].length} rows
                            </div>
                            <button
                              onClick={() => setShowAllRows(prev => ({ ...prev, [name]: !prev[name] }))}
                              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm flex items-center gap-2 transition-colors"
                            >
                              {showAllRows[name] ? (
                                <><ChevronDown className="w-4 h-4" /> Show Less</>
                              ) : (
                                <><Table className="w-4 h-4" /> Show All Rows</>
                              )}
                            </button>
                          </div>
                        )}

                        <div className="overflow-x-auto">
                          <table className="w-full text-xs font-mono">
                            <thead>
                              <tr className="border-b border-slate-700 bg-slate-800/50">
                                <th className="text-left p-2 text-slate-400 sticky left-0 bg-slate-800/50">#</th>
                                {rawSheets[name][0] && Object.keys(rawSheets[name][0]).map(k => (
                                  <th key={k} className="text-left p-2 text-slate-400 whitespace-nowrap">{k}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rawSheets[name].slice(0, showAllRows[name] ? undefined : 50).map((row, i) => (
                                <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                                  <td className="p-2 text-slate-500 sticky left-0 bg-black/20">{i + 1}</td>
                                  {Object.values(row).map((v, j) => (
                                    <td key={j} className="p-2 text-slate-300 whitespace-nowrap">{String(v ?? '')}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {rawSheets[name].length > 50 && !showAllRows[name] && (
                          <div className="text-center text-sm text-slate-400 mt-3 pt-3 border-t border-slate-700">
                            {rawSheets[name].length - 50} more rows available
                            <button
                              onClick={() => setShowAllRows(prev => ({ ...prev, [name]: true }))}
                              className="ml-2 text-cyan-400 hover:text-cyan-300 underline"
                            >
                              Show all
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default BMSAnalyzer;
