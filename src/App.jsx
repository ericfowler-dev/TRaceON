import React, { useState, useMemo, useEffect, useCallback, useRef, useReducer } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, ReferenceLine
} from 'recharts';
import {
  FileSpreadsheet, Upload, AlertCircle, AlertTriangle, Clock, Zap,
  ThermometerSun, Battery, Activity, Gauge, Cpu, CheckCircle,
  ShieldAlert, Calendar, ChevronDown, ChevronRight, Table, X,
  Play, Pause, SkipBack, SkipForward, Camera, TrendingUp, Info,
  Search, Flag, Eye
} from 'lucide-react';

// Import from extracted modules
import {
  ALARM_MAPPING, SEVERITY_MAP, detectProduct,
  RELAY_NAMES, getRelayConfig, ALL_RELAYS, THRESHOLDS
} from './lib/thresholds';
import {
  fmt, fmtTime, fmtDuration, formatInsulation,
  iterativeMergeSort, getVoltageHeatMap
} from './lib/parsers';

// Import extracted chart components
import PackSocChart from './components/charts/PackSocChart';
import CellVoltageChart from './components/charts/CellVoltageChart';
import CellImbalanceChart from './components/charts/CellImbalanceChart';

// =============================================================================
// DEBUG FLAG - Set to true to enable console logging
// =============================================================================
const DEBUG = false;
const PERF = false;

const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

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
// STATE MANAGEMENT - useReducer for analysis state
// =============================================================================
const analysisInitialState = {
  timeSeries: [],
  faultEvents: [],
  anomalies: [],
  deviceInfo: {},
  cellIndexRange: null,
  selectedDate: 'all',
  playbackIdx: 0,
  isPlaying: false,
  playbackSpeed: 1,
  chartZoom: { start: 0, end: 100 }
};

function analysisReducer(state, action) {
  switch (action.type) {
    case 'FILE_LOADED':
      return {
        ...state,
        timeSeries: action.payload.timeSeries,
        faultEvents: action.payload.faultEvents,
        anomalies: action.payload.anomalies,
        deviceInfo: action.payload.deviceInfo,
        cellIndexRange: action.payload.cellIndexRange || null,
        selectedDate: 'all',
        playbackIdx: 0,
        isPlaying: false,
        chartZoom: { start: 0, end: 100 }
      };
    case 'SET_DATE':
      return {
        ...state,
        selectedDate: action.payload,
        playbackIdx: 0,
        isPlaying: false,
        chartZoom: { start: 0, end: 100 }
      };
    case 'SET_PLAYBACK_IDX':
      return { ...state, playbackIdx: action.payload };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.payload };
    case 'TOGGLE_PLAYING':
      return { ...state, isPlaying: !state.isPlaying };
    case 'SET_PLAYBACK_SPEED':
      return { ...state, playbackSpeed: action.payload };
    case 'SET_ZOOM':
      return { ...state, chartZoom: action.payload };
    case 'RESET':
      return analysisInitialState;
    default:
      return state;
  }
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const BMSAnalyzer = () => {
  // Analysis state managed by reducer (prevents cross-field bugs)
  const [state, dispatch] = useReducer(analysisReducer, analysisInitialState);
  const { timeSeries, faultEvents, anomalies, deviceInfo, cellIndexRange, selectedDate, playbackIdx, isPlaying, playbackSpeed, chartZoom } = state;

  // UI state (remains as individual useState for simplicity)
  const [rawSheets, setRawSheets] = useState({});
  const [rawSheetNames, setRawSheetNames] = useState([]);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedSheets, setExpandedSheets] = useState({});
  const [showAllRows, setShowAllRows] = useState({});
  const [searchTime, setSearchTime] = useState('');
  const workerRef = useRef(null);

  useEffect(() => {
    if (PERF) console.log(`[perf] tab change: ${activeTab}`);
  }, [activeTab]);

  useEffect(() => {
    if (workerRef.current) return;
    const worker = new Worker(new URL('./workers/bmsWorker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const message = event.data || {};
      if (message.type === 'loaded') {
        dispatch({
          type: 'FILE_LOADED',
          payload: {
            timeSeries: message.timeSeries || [],
            faultEvents: message.faultEvents || [],
            anomalies: message.anomalies || [],
            deviceInfo: message.deviceInfo || {},
            cellIndexRange: message.cellIndexRange || null
          }
        });
        setRawSheetNames(message.sheetNames || []);
        setIsLoading(false);
        return;
      }
      if (message.type === 'rawSheet') {
        const { name, rows } = message;
        setRawSheets(prev => (prev[name] ? prev : { ...prev, [name]: rows || [] }));
        return;
      }
      if (message.type === 'error') {
        setError(message.message || 'Worker error');
        setIsLoading(false);
      }
    };

    worker.onerror = (err) => {
      console.error('Worker error:', err);
      setError(err?.message || 'Worker error');
      setIsLoading(false);
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [dispatch]);

  const loadRawSheet = useCallback((name) => {
    if (rawSheets[name]) return;
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type: 'rawSheet', name });
  }, [rawSheets]);

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
    setRawSheets({});
    setRawSheetNames([]);
    setExpandedSheets({});
    setShowAllRows({});
    if (!workerRef.current) {
      setError('Worker not ready');
      setIsLoading(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target.result;
        workerRef.current.postMessage({ type: 'load', buffer }, [buffer]);
      } catch (err) {
        console.error('Parse error:', err);
        setError('Failed to parse file: ' + err.message);
        setIsLoading(false);
      }
    };

    // Use ArrayBuffer instead of BinaryString for better memory handling
    reader.readAsArrayBuffer(file);
  };

  // ---------------------------------------------------------------------------
  // COMPUTED DATA
  // ---------------------------------------------------------------------------
  const availableDates = useMemo(() => {
    const dates = [...new Set(timeSeries.map(d => d.dateKey))].filter(Boolean);
    return iterativeMergeSort(dates, (a, b) => a.localeCompare(b));
  }, [timeSeries]);

  const filteredData = useMemo(() => {
    if (selectedDate === 'all') return timeSeries;
    return timeSeries.filter(d => d.dateKey === selectedDate);
  }, [timeSeries, selectedDate]);

  const stats = useMemo(() => {
    if (!filteredData.length) return null;

    const t0 = perfNow();
    const first = filteredData[0];
    const last = filteredData[filteredData.length - 1];
    const cellCount = cellIndexRange?.count ?? Object.keys(first.cells || {}).length;

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
    for (let i = 0; i < filteredData.length; i++) {
      const d = filteredData[i];
      if (d.balancing) {
        const balancingEntries = Object.entries(d.balancing);
        for (let j = 0; j < balancingEntries.length; j++) {
          const [cell, state] = balancingEntries[j];
          if (state === 'ACTIVE') balancingCells.add(cell);
        }
      }
    }

    const result = {
      timeRange: { start: first.time, end: last.time },
      duration: (last.ts - first.ts) / 60000,
      samples: filteredData.length,
      cellCount,
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
    if (PERF) {
      console.log(
        `[perf] stats: ${(perfNow() - t0).toFixed(1)}ms, samples=${filteredData.length}`
      );
    }
    return result;
  }, [filteredData, faultEvents, anomalies, selectedDate, cellIndexRange]);

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

    const t0 = perfNow();
    // Downsample first to 1200 points, then transform
    // This gives us 300 points per 25% view after zoom slicing
    const maxPts = 1200;
    const downsampledData = filteredData.length > maxPts
      ? lttbDownsample(filteredData, maxPts)
      : filteredData;
    const t1 = perfNow();

    if (DEBUG) console.log(`chartData: Downsampled to ${downsampledData.length} points (from ${filteredData.length} raw)`);

    // DEBUG: Check first entry's cell data
    if (DEBUG && downsampledData.length > 0) {
      const firstEntry = downsampledData[0];
      console.log('chartData: First entry cells object:', firstEntry.cells);
      console.log('chartData: First entry has', Object.keys(firstEntry.cells || {}).length, 'cells');
    }

    // Transform the downsampled data
    const transformed = downsampledData.map(d => {
      // Build cell voltage object - ensure keys are numeric and map to cell0, cell1, cell2, etc.
      const cellVoltages = {};
      let hasCells = false;
      if (d.cells) {
        const cellEntries = Object.entries(d.cells);
        for (let i = 0; i < cellEntries.length; i++) {
          const [k, v] = cellEntries[i];
          // Parse cell index (handle both "0" and "1" based indexing)
          const cellIdx = parseInt(k, 10);
          if (!isNaN(cellIdx) && v != null) {
            if (v >= 1000 && v <= 5000) {
              cellVoltages[`cell${cellIdx}`] = v;
              hasCells = true;
            }
          }
        }
      }

      // Build temperature object + fallback for cell keys if cells object is missing
      const temps = {};
      const entries = Object.entries(d);
      if (!hasCells) {
        for (let i = 0; i < entries.length; i++) {
          const [k, v] = entries[i];
          if (/^cell\d+$/.test(k) && v != null && v >= 1000 && v <= 5000) {
            cellVoltages[k] = v;
            hasCells = true;
          }
        }
      }
      for (let i = 0; i < entries.length; i++) {
        const [k, v] = entries[i];
        if (/^temp\d+$/.test(k) && v != null) {
          temps[k] = v;
        }
      }

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
        hasCells,
        ...cellVoltages,
        ...temps
      };
    });
    const t2 = perfNow();

    if (PERF) {
      const downsampleMs = (t1 - t0).toFixed(1);
      const transformMs = (t2 - t1).toFixed(1);
      console.log(
        `[perf] chartData: downsample=${downsampleMs}ms, transform=${transformMs}ms, ` +
        `raw=${filteredData.length}, downsampled=${downsampledData.length}`
      );
    }

    // Now return the full transformed dataset - we'll downsample in zoomedChartData
    if (DEBUG && transformed.length > 0) {
      const cellKeys = Object.keys(transformed[0]).filter(k => k.startsWith('cell'));
      console.log(`chartData: Transformed ${transformed.length} entries with ${cellKeys.length} cell keys`);
      console.log('chartData: First entry has cell keys:', cellKeys);
      console.log('chartData: First entry sample values:', cellKeys.slice(0, 5).map(k => `${k}=${transformed[0][k]}`).join(', '));
    }

    return transformed;
  }, [filteredData]);

  // Apply zoom to chart data (no additional downsampling needed)
  const zoomedChartData = useMemo(() => {
    if (!chartData.length) return [];

    const t0 = perfNow();
    const startIdx = Math.floor((chartData.length * chartZoom.start) / 100);
    const endIdx = Math.ceil((chartData.length * chartZoom.end) / 100);

    // Ensure we always have at least some data points
    const safeStartIdx = Math.max(0, Math.min(startIdx, chartData.length - 1));
    const safeEndIdx = Math.max(safeStartIdx + 1, Math.min(endIdx, chartData.length));

    const zoomedSlice = chartData.slice(safeStartIdx, safeEndIdx);
    const t1 = perfNow();

    if (DEBUG) console.log(`zoomedChartData: ${zoomedSlice.length} points in zoom range`);
    if (PERF) {
      console.log(
        `[perf] zoomedChartData: slice=${(t1 - t0).toFixed(1)}ms, ` +
        `points=${zoomedSlice.length}, range=${chartZoom.start.toFixed(0)}-${chartZoom.end.toFixed(0)}`
      );
    }

    return zoomedSlice;
  }, [chartData, chartZoom]);

  const zoomedCellChartData = useMemo(() => {
    if (!zoomedChartData.length) return [];
    const t0 = perfNow();
    const filtered = [];
    for (let i = 0; i < zoomedChartData.length; i++) {
      const entry = zoomedChartData[i];
      if (entry.hasCells) filtered.push(entry);
    }
    const t1 = perfNow();
    if (PERF) {
      console.log(
        `[perf] zoomedCellChartData: filter=${(t1 - t0).toFixed(1)}ms, points=${filtered.length}`
      );
    }
    return filtered;
  }, [zoomedChartData]);

  // Detect date changes in chart data for visual markers
  const dateChangeMarkers = useMemo(() => {
    const markers = [];
    let prevDate = null;

    for (let i = 0; i < chartData.length; i++) {
      const d = chartData[i];
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
    }

    return markers;
  }, [chartData]);

  const currentSnap = filteredData[playbackIdx] || null;

  // Guard playbackIdx bounds when filteredData changes (e.g., date filter)
  useEffect(() => {
    if (filteredData.length > 0 && playbackIdx >= filteredData.length) {
      dispatch({ type: 'SET_PLAYBACK_IDX', payload: filteredData.length - 1 });
    }
  }, [filteredData.length, playbackIdx]);

  // Playback timer with variable speed
  useEffect(() => {
    if (!isPlaying || !filteredData.length) return;
    // Base interval is 100ms, adjusted by playback speed
    const interval = setInterval(() => {
      const currentIdx = playbackIdx;
      if (currentIdx >= filteredData.length - 1) {
        dispatch({ type: 'SET_PLAYING', payload: false });
      } else {
        dispatch({ type: 'SET_PLAYBACK_IDX', payload: currentIdx + 1 });
      }
    }, 100 / playbackSpeed); // Faster speeds = shorter interval
    return () => clearInterval(interval);
  }, [isPlaying, filteredData.length, playbackSpeed, playbackIdx]);

  // Jump to time
  const jumpToTime = (timeStr) => {
    if (!timeStr || !timeStr.trim()) return;
    const idx = filteredData.findIndex(d => d.fullTime?.includes(timeStr) || d.timeStr?.includes(timeStr));
    if (idx >= 0) {
      dispatch({ type: 'SET_PLAYBACK_IDX', payload: idx });
      setActiveTab('snapshot');
    }
  };

  // Jump to anomaly
  const jumpToAnomaly = (anomaly) => {
    const idx = filteredData.findIndex(d => Math.abs(d.ts - anomaly.time.getTime()) < 2000);
    if (idx >= 0) {
      dispatch({ type: 'SET_PLAYBACK_IDX', payload: idx });
      setActiveTab('snapshot');
    }
  };

  const reset = () => {
    dispatch({ type: 'RESET' });
    setRawSheets({});
    setRawSheetNames([]);
    setFileName('');
    setActiveTab('overview');
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
              <p className="text-sm text-slate-500">{stats?.samples} samples • {fmtDuration(stats?.duration)} • v1.0</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Date Filter */}
            {availableDates.length > 1 && (
              <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <select
                  id="date-filter"
                  name="dateFilter"
                  className="bg-transparent border-none text-sm font-medium cursor-pointer focus:outline-none"
                  value={selectedDate}
                  onChange={(e) => dispatch({ type: 'SET_DATE', payload: e.target.value })}
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

            {/* Upload New BMS Log Button */}
            <button
              onClick={reset}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all font-semibold shadow-lg shadow-emerald-600/30 hover:shadow-xl hover:shadow-emerald-500/40"
            >
              <Upload className="w-4 h-4" />
              Upload New BMS Log
            </button>

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
                    <div className="text-sm text-red-300/70">Abnormal Conditions found - Check Charts, Faults, and Snapshot Playback</div>
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
                        isAnimationActive={false}
                        animationDuration={0}
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
                        isAnimationActive={false}
                        animationDuration={0}
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
                      onClick={() => dispatch({ type: 'SET_ZOOM', payload: { start: 0, end: 100 } })}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                        chartZoom.start === 0 && chartZoom.end === 100
                          ? 'bg-cyan-500 text-white shadow-lg'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      Full View
                    </button>
                    <button
                      onClick={() => dispatch({ type: 'SET_ZOOM', payload: { start: 0, end: 50 } })}
                      className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-sm font-semibold transition-all"
                    >
                      First Half
                    </button>
                    <button
                      onClick={() => dispatch({ type: 'SET_ZOOM', payload: { start: 50, end: 100 } })}
                      className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-sm font-semibold transition-all"
                    >
                      Last Half
                    </button>
                    <button
                      onClick={() => dispatch({ type: 'SET_ZOOM', payload: { start: 75, end: 100 } })}
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
                    onClick={() => dispatch({ type: 'SET_ZOOM', payload: { start: 0, end: 100 } })}
                    className={`px-3 py-2 rounded text-xs font-semibold transition-colors ${
                      chartZoom.start === 0 && chartZoom.end === 100
                        ? 'bg-blue-700 text-white hover:bg-blue-600'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Full View
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'SET_ZOOM', payload: { start: 0, end: 25 } })}
                    className={`px-3 py-2 rounded text-xs font-semibold transition-colors ${
                      chartZoom.start === 0 && chartZoom.end === 25
                        ? 'bg-blue-700 text-white hover:bg-blue-600'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    First 25%
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'SET_ZOOM', payload: { start: 25, end: 50 } })}
                    className={`px-3 py-2 rounded text-xs font-semibold transition-colors ${
                      chartZoom.start === 25 && chartZoom.end === 50
                        ? 'bg-blue-700 text-white hover:bg-blue-600'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Second 25%
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'SET_ZOOM', payload: { start: 50, end: 75 } })}
                    className={`px-3 py-2 rounded text-xs font-semibold transition-colors ${
                      chartZoom.start === 50 && chartZoom.end === 75
                        ? 'bg-blue-700 text-white hover:bg-blue-600'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Third 25%
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'SET_ZOOM', payload: { start: 75, end: 100 } })}
                    className={`px-3 py-2 rounded text-xs font-semibold transition-colors ${
                      chartZoom.start === 75 && chartZoom.end === 100
                        ? 'bg-blue-700 text-white hover:bg-blue-600'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Last 25%
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'SET_ZOOM', payload: { start: 40, end: 60 } })}
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

            <PackSocChart data={zoomedChartData} dateChangeMarkers={dateChangeMarkers} />

            <CellVoltageChart
              data={zoomedCellChartData}
              cellCount={stats?.cellCount}
              cellIndexStart={cellIndexRange?.min ?? 0}
              dateChangeMarkers={dateChangeMarkers}
            />

            <CellImbalanceChart data={zoomedChartData} faultEvents={faultEvents} />
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
                <button onClick={() => dispatch({ type: 'SET_PLAYBACK_IDX', payload: 0 })} className="p-2 hover:bg-slate-800 rounded-lg"><SkipBack className="w-4 h-4" /></button>
                <button onClick={() => dispatch({ type: 'SET_PLAYBACK_IDX', payload: Math.max(0, playbackIdx - 10) })} className="px-2 py-1 text-xs hover:bg-slate-800 rounded">−10</button>
                <button onClick={() => dispatch({ type: 'TOGGLE_PLAYING' })} className={`p-2 rounded-lg ${isPlaying ? 'bg-red-600' : 'bg-emerald-600'}`}>
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button onClick={() => dispatch({ type: 'SET_PLAYBACK_IDX', payload: Math.min(filteredData.length - 1, playbackIdx + 10) })} className="px-2 py-1 text-xs hover:bg-slate-800 rounded">+10</button>
                <button onClick={() => dispatch({ type: 'SET_PLAYBACK_IDX', payload: filteredData.length - 1 })} className="p-2 hover:bg-slate-800 rounded-lg"><SkipForward className="w-4 h-4" /></button>

                {/* Playback Speed Controls */}
                <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg px-2 py-1 border border-slate-700">
                  <span className="text-xs text-slate-400 mr-1">Speed:</span>
                  {[0.25, 0.5, 1, 2, 4].map(speed => (
                    <button
                      key={speed}
                      onClick={() => dispatch({ type: 'SET_PLAYBACK_SPEED', payload: speed })}
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
                    onChange={e => dispatch({ type: 'SET_PLAYBACK_IDX', payload: +e.target.value })} className="w-full accent-emerald-500" />
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
                {rawSheetNames.length === 0 && (
                  <div className="text-sm text-slate-400">No raw sheets loaded.</div>
                )}
                {rawSheetNames.map(name => (
                  <div key={name} className="border border-slate-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => {
                        const isExpanding = !expandedSheets[name];
                        setExpandedSheets(prev => ({ ...prev, [name]: !prev[name] }));
                        if (isExpanding) loadRawSheet(name);
                      }}
                      className="w-full p-3 flex items-center justify-between bg-slate-800/50 hover:bg-slate-800 transition"
                    >
                      <div className="flex items-center gap-2">
                        {expandedSheets[name] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="font-mono text-sm">{name}</span>
                        {rawSheets[name] ? (
                          <span className="text-xs text-slate-500">({rawSheets[name].length} rows)</span>
                        ) : (
                          <span className="text-xs text-slate-500">(not loaded)</span>
                        )}
                      </div>
                    </button>
                    {expandedSheets[name] && (
                      <div className="p-4 bg-black/20">
                        {!rawSheets[name] ? (
                          <div className="text-sm text-slate-400">Loading sheet data...</div>
                        ) : (
                        <>
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
                        </>
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
