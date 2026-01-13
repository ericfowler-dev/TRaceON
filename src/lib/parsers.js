// =============================================================================
// BMS DATA PARSING UTILITIES
// =============================================================================

import { THRESHOLDS } from './thresholds';

// Clean BOM and whitespace from Excel keys
export const cleanKey = (k) => k ? k.replace(/^\ufeff/, '').trim() : '';

// Parse BMS date format: "YYYY/MM/DD HH:MM:SS"
export const parseDate = (str) => {
  if (!str) return null;
  if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
  if (typeof str === 'number') {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof str !== 'string') return null;
  const parts = str.trim().split(/[\s/:]+/);
  if (parts.length < 6) return null;
  const d = new Date(+parts[0], +parts[1] - 1, +parts[2], +parts[3], +parts[4], +parts[5]);
  return isNaN(d.getTime()) ? null : d;
};

// Get value from row by trying multiple possible key names
export const getVal = (row, ...keys) => {
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

// Find sheet by partial name match
export const findSheet = (sheets, ...terms) => {
  for (const term of terms) {
    const name = Object.keys(sheets).find(n => n.toLowerCase().includes(term.toLowerCase()));
    if (name) return sheets[name];
  }
  return [];
};

// Formatting utilities
export const fmt = (v, dec = 1) => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(dec);
export const fmtTime = (d) => d ? d.toLocaleString() : '—';
export const fmtDuration = (min) => {
  if (min == null) return '—';
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.round(min)}m`;
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
};

export const formatInsulation = (val) => {
  if (val == null) return '—';
  if (val >= THRESHOLDS.insulation.open) return '> 65MΩ (Open)';
  if (val >= 1000) return `${(val / 1000).toFixed(2)} MΩ`;
  return `${val.toFixed(2)} kΩ`;
};

// Safe min/max for large arrays - avoids stack overflow from Math.min(...arr) spread operator
export const arrMin = (arr) => { let m = arr[0]; for (let i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i]; return m; };
export const arrMax = (arr) => { let m = arr[0]; for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i]; return m; };

// Iterative (non-recursive) merge sort to avoid stack overflow on large arrays
// JavaScript's Array.sort() uses recursive algorithms that fail on 10,000+ elements
export const iterativeMergeSort = (arr, compareFn) => {
  if (arr.length <= 1) return arr;

  const result = [...arr];
  const n = result.length;

  for (let size = 1; size < n; size *= 2) {
    for (let start = 0; start < n; start += 2 * size) {
      const mid = Math.min(start + size, n);
      const end = Math.min(start + 2 * size, n);

      const left = result.slice(start, mid);
      const right = result.slice(mid, end);

      let i = 0, j = 0, k = start;

      while (i < left.length && j < right.length) {
        if (compareFn(left[i], right[j]) <= 0) {
          result[k++] = left[i++];
        } else {
          result[k++] = right[j++];
        }
      }

      while (i < left.length) result[k++] = left[i++];
      while (j < right.length) result[k++] = right[j++];
    }
  }

  return result;
};

// Heat map for cell voltages (mV) - Three-level boundary system
export const getVoltageHeatMap = (voltage, minV, maxV, avgV) => {
  if (voltage == null) return { bg: 'bg-slate-700/80', text: 'text-slate-400', label: 'NO DATA' };

  if (voltage > THRESHOLDS.cellVoltage.critical || voltage < 1000) {
    return { bg: 'bg-red-600/90', text: 'text-white', label: 'ERROR' };
  }

  if (voltage < THRESHOLDS.cellVoltage.marginal.min || voltage > THRESHOLDS.cellVoltage.marginal.max) {
    if (voltage < THRESHOLDS.cellVoltage.good.min) {
      return { bg: 'bg-red-500/80', text: 'text-white', label: 'LOW' };
    } else {
      return { bg: 'bg-red-500/80', text: 'text-white', label: 'HIGH' };
    }
  }

  if (voltage < THRESHOLDS.cellVoltage.good.min || voltage > THRESHOLDS.cellVoltage.good.max) {
    if (voltage < THRESHOLDS.cellVoltage.good.min) {
      return { bg: 'bg-amber-500/80', text: 'text-slate-900', label: 'BELOW' };
    } else {
      return { bg: 'bg-amber-500/80', text: 'text-slate-900', label: 'ABOVE' };
    }
  }

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
