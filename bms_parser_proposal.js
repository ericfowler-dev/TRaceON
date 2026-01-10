/* 
  bms_parser_proposal.js

  Purpose:
  Drop-in utilities and a reference parsing flow to address the main issues found in the original BMSAnalyzer:
  - Safer column matching (no fuzzy substring accidents)
  - Robust time parsing (string, Date, Excel serial)
  - Preserve valid zeros (no `|| undefined` numeric loss)
  - Merge rows across sheets using a time bucket / tolerance
  - Fault events that do not overlap on severity changes
  - Faster snapshot lookup (binary search)
  - Safer heat map math (no divide-by-zero)

  Usage idea:
  - Keep your UI component.
  - Move all parsing into a pure function `parseWorkbookSheets(sheets, options)`.
  - Call it once after XLSX import, store results in state.

  This file is framework agnostic JS.
*/

/* =========================
   Normalization and headers
   ========================= */

export function cleanBomTrim(s) {
  return typeof s === "string" ? s.replace(/^\ufeff/, "").trim() : "";
}

export function normalizeHeader(s) {
  // Lowercase, collapse whitespace, remove trailing unit punctuation but keep key symbols.
  const t = cleanBomTrim(s).toLowerCase();
  return t
    .replace(/\s+/g, " ")
    .replace(/[（）()]/g, "")     // remove parentheses
    .replace(/\s*\.\s*/g, ".")    // normalize dots
    .trim();
}

export function buildHeaderIndex(rows) {
  // rows are objects from XLSX.utils.sheet_to_json
  // This maps normalized header -> original key used in row objects.
  const index = new Map();
  if (!rows || !rows.length) return index;

  // Prefer the first row's keys, but also scan a few more rows for weird exports
  const maxScan = Math.min(rows.length, 5);
  for (let i = 0; i < maxScan; i++) {
    const row = rows[i];
    if (!row) continue;
    for (const rawKey of Object.keys(row)) {
      const norm = normalizeHeader(rawKey);
      if (norm && !index.has(norm)) index.set(norm, rawKey);
    }
  }
  return index;
}

export function getField(row, headerIndex, names, opts = {}) {
  // Strict by default:
  // - exact normalized header match only
  // - optional fallback alias match
  // - optional "contains" matching only when explicitly enabled
  const { allowContains = false } = opts;

  for (const name of names) {
    const norm = normalizeHeader(name);
    const rawKey = headerIndex.get(norm);
    if (rawKey !== undefined) {
      const v = row[rawKey];
      if (v !== null && v !== undefined && v !== "" && v !== "Invalid") return v;
    }
  }

  if (allowContains) {
    for (const name of names) {
      const n = normalizeHeader(name);
      for (const [normHeader, rawKey] of headerIndex.entries()) {
        if (normHeader.includes(n)) {
          const v = row[rawKey];
          if (v !== null && v !== undefined && v !== "" && v !== "Invalid") return v;
        }
      }
    }
  }

  return undefined;
}

/* =========================
   Numbers and time parsing
   ========================= */

export function toNumber(v) {
  // Preserve zeros, reject non-finite results.
  if (v === null || v === undefined || v === "" || v === "Invalid") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}

export function parseTimeValue(v) {
  // Accept Date objects, common strings, and Excel serial dates (numbers).
  if (!v && v !== 0) return null;

  if (v instanceof Date) {
    return Number.isFinite(v.getTime()) ? v : null;
  }

  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial date (days since 1899-12-30 for the 1900 system).
    // This covers most typical exports. If your files use the 1904 system, adjust via a flag.
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;

    // Fast path: Date.parse works on ISO and many locale-ish strings.
    const t1 = Date.parse(s);
    if (Number.isFinite(t1)) return new Date(t1);

    // Fallback for formats like "YYYY/MM/DD HH:MM:SS" or "YYYY-MM-DD HH:MM:SS"
    const parts = s.split(/[\sT/:.-]+/).filter(Boolean);
    if (parts.length >= 6) {
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      const d = Number(parts[2]);
      const hh = Number(parts[3]);
      const mm = Number(parts[4]);
      const ss = Number(parts[5]);
      const dt = new Date(y, m - 1, d, hh, mm, ss);
      return Number.isFinite(dt.getTime()) ? dt : null;
    }
  }

  return null;
}

/* =========================
   Time merging helpers
   ========================= */

export function makeTimeKey(ts, bucketMs) {
  // bucketMs example: 1000 or 2000.
  // Using rounding reduces drift between sheets.
  return Math.round(ts / bucketMs) * bucketMs;
}

export function getOrCreateEntry(map, keyTs, timeObj) {
  let e = map.get(keyTs);
  if (!e) {
    const t = timeObj;
    const dateKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    e = {
      time: t,
      ts: keyTs,
      dateKey,
      timeStr: t.toLocaleTimeString(),
      fullTime: t.toLocaleString(),
      cells: {},
      relays: {},
      balancing: {}
    };
    map.set(keyTs, e);
  }
  return e;
}

/* =========================
   Binary search for nearest
   ========================= */

export function buildTimestampIndex(series) {
  return series.map(d => d.ts);
}

export function nearestIndexByTime(tsArray, targetTs) {
  // returns nearest index
  if (!tsArray.length) return -1;
  let lo = 0;
  let hi = tsArray.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = tsArray[mid];
    if (v === targetTs) return mid;
    if (v < targetTs) lo = mid + 1;
    else hi = mid - 1;
  }

  // lo is insertion point
  const i1 = Math.max(0, Math.min(tsArray.length - 1, lo));
  const i0 = Math.max(0, i1 - 1);

  const d0 = Math.abs(tsArray[i0] - targetTs);
  const d1 = Math.abs(tsArray[i1] - targetTs);
  return d1 < d0 ? i1 : i0;
}

/* =========================
   Fault event logic
   ========================= */

export function updateFaultState(activeMap, faultsOut, faultCode, faultName, severity, severityText, timeObj, snapshotProvider) {
  // Option: segment events on severity change (close old, open new).
  const prev = activeMap.get(faultCode);

  const prevSev = prev ? prev.severity : 0;
  const curSev = severity;

  if (curSev === prevSev) return;

  // Close previous if it existed and new severity differs
  if (prev && prevSev > 0) {
    prev.event.endTime = timeObj;
    prev.event.durationMin = (timeObj.getTime() - prev.startTime.getTime()) / 60000;
    faultsOut.push(prev.event);
    activeMap.set(faultCode, { severity: 0 });
  }

  // Open new if now active
  if (curSev > 0) {
    const snap = snapshotProvider ? snapshotProvider(timeObj) : null;
    const evt = {
      id: `${faultCode}-${timeObj.getTime()}-${curSev}`,
      code: faultCode,
      name: faultName,
      severity: curSev,
      severityText,
      time: timeObj,
      timeStr: timeObj.toLocaleString(),
      startTime: timeObj,
      endTime: null,
      durationMin: null,
      ongoing: true,
      snapshot: snap || {}
    };
    activeMap.set(faultCode, { severity: curSev, startTime: timeObj, event: evt });
  }
}

export function closeAllOpenFaults(activeMap, endTimeObj, faultsOut) {
  for (const [code, state] of activeMap.entries()) {
    if (state && state.severity > 0 && state.event) {
      state.event.endTime = endTimeObj;
      state.event.durationMin = (endTimeObj.getTime() - state.startTime.getTime()) / 60000;
      state.event.ongoing = true;
      faultsOut.push(state.event);
      activeMap.set(code, { severity: 0 });
    }
  }
}

/* =========================
   Heat map safety
   ========================= */

export function safeVoltageHeatLabel(voltage, minV, maxV) {
  if (voltage === null || voltage === undefined) return "NO_DATA";
  if (!Number.isFinite(voltage)) return "ERROR";
  if (voltage > 5000 || voltage < 1000) return "ERROR";
  if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return "NO_DATA";

  const range = maxV - minV;
  if (range <= 0) return "FLAT";

  const pos = (voltage - minV) / range;
  if (pos < 0.1) return "LOW";
  if (pos < 0.4) return "BELOW";
  if (pos <= 0.6) return "GOOD";
  if (pos < 0.9) return "ABOVE";
  return "HIGH";
}

/* =========================
   Reference parse flow
   ========================= */

export function parseWorkbookSheets(sheets, options = {}) {
  const {
    bucketMs = 1000,
    sheetFind = (name, term) => name.toLowerCase().includes(term.toLowerCase()),
    alarmMapping = {},
    severityMap = { "Lvl 1 Alarm": 1, "Lvl 2 Alarm": 2, "Lvl 3 Alarm": 3 }
  } = options;

  const sheetNames = Object.keys(sheets || {});
  const findSheetRows = (...terms) => {
    for (const term of terms) {
      const name = sheetNames.find(n => sheetFind(n, term));
      if (name) return sheets[name] || [];
    }
    return [];
  };

  const voltRows = findSheetRows("voltage", "0x9a");
  const tempRows = findSheetRows("temperature", "0x09");
  const peakRows = findSheetRows("peak", "0x9b");
  const sysRows = findSheetRows("system state", "0x93");
  const alarmRows = findSheetRows("alarm", "0x87");

  // Build header indices once per sheet
  const idxVolt = buildHeaderIndex(voltRows);
  const idxTemp = buildHeaderIndex(tempRows);
  const idxPeak = buildHeaderIndex(peakRows);
  const idxSys  = buildHeaderIndex(sysRows);
  const idxAlm  = buildHeaderIndex(alarmRows);

  const dataMap = new Map();

  // VOLTAGES
  for (let i = 0; i < voltRows.length; i++) {
    const row = voltRows[i];
    const t = parseTimeValue(getField(row, idxVolt, ["Time"]));
    if (!t) continue;
    const key = makeTimeKey(t.getTime(), bucketMs);
    const e = getOrCreateEntry(dataMap, key, t);

    e.packVoltage = toNumber(getField(row, idxVolt, ["Pack volt.(V)", "Pack volt", "Pack voltage"]));
    e.current = toNumber(getField(row, idxVolt, ["Current(A)", "Current"]));

    for (const rawKey of Object.keys(row)) {
      const hk = normalizeHeader(rawKey);
      const m = hk.match(/cell volt\.n\+(\d+)/i);
      if (!m) continue;
      const cellIdx = Number(m[1]);
      const v = toNumber(row[rawKey]);
      if (v !== undefined) e.cells[cellIdx] = v;
    }
  }

  // TEMPS
  for (let i = 0; i < tempRows.length; i++) {
    const row = tempRows[i];
    const t = parseTimeValue(getField(row, idxTemp, ["Time"]));
    if (!t) continue;
    const key = makeTimeKey(t.getTime(), bucketMs);
    const e = getOrCreateEntry(dataMap, key, t);

    for (const rawKey of Object.keys(row)) {
      const hk = normalizeHeader(rawKey);
      const m = hk.match(/celltemp(\d+)/i);
      if (!m) continue;
      const n = toNumber(row[rawKey]);
      if (n !== undefined) e[`temp${m[1]}`] = n;
    }
  }

  // PEAKS
  for (let i = 0; i < peakRows.length; i++) {
    const row = peakRows[i];
    const t = parseTimeValue(getField(row, idxPeak, ["Time"]));
    if (!t) continue;
    const key = makeTimeKey(t.getTime(), bucketMs);
    const e = getOrCreateEntry(dataMap, key, t);

    e.maxCellV = toNumber(getField(row, idxPeak, ["Max cell(mv)", "Max cell"]));
    e.minCellV = toNumber(getField(row, idxPeak, ["Min cell(mv)", "Min cell"]));
    e.maxTemp  = toNumber(getField(row, idxPeak, ["Max temp.(℃)", "Max temp"]));
    e.minTemp  = toNumber(getField(row, idxPeak, ["Min temp.(℃)", "Min temp"]));

    // diff computation should happen later when values exist
    if (e.maxCellV !== undefined && e.minCellV !== undefined) e.cellDiff = e.maxCellV - e.minCellV;
    if (e.maxTemp !== undefined && e.minTemp !== undefined) e.tempDiff = e.maxTemp - e.minTemp;
  }

  // SYSTEM
  for (let i = 0; i < sysRows.length; i++) {
    const row = sysRows[i];
    const t = parseTimeValue(getField(row, idxSys, ["Time"]));
    if (!t) continue;
    const key = makeTimeKey(t.getTime(), bucketMs);
    const e = getOrCreateEntry(dataMap, key, t);

    e.soc = toNumber(getField(row, idxSys, ["Shown SOC", "Real SOC", "SOC"]));
    e.realSoc = toNumber(getField(row, idxSys, ["Real SOC"]));
    e.soh = toNumber(getField(row, idxSys, ["SOH"]));
    e.systemState = getField(row, idxSys, ["System state", "State"]);

    e.insulationRes = toNumber(getField(row, idxSys, ["Sys. insul. resistance", "Insulation resistance"]));
  }

  const timeSeries = Array.from(dataMap.values()).sort((a, b) => a.ts - b.ts);
  const tsIndex = buildTimestampIndex(timeSeries);

  const snapshotProvider = (timeObj) => {
    const idx = nearestIndexByTime(tsIndex, timeObj.getTime());
    if (idx < 0) return {};
    return timeSeries[idx];
  };

  // ALARMS to FAULT EVENTS
  const faults = [];
  const active = new Map();

  for (let i = 0; i < alarmRows.length; i++) {
    const row = alarmRows[i];
    const t = parseTimeValue(getField(row, idxAlm, ["Time"]));
    if (!t) continue;

    for (const rawKey of Object.keys(row)) {
      const key = cleanBomTrim(rawKey);
      const normKey = cleanBomTrim(key);
      if (!normKey || normKey.toLowerCase() === "time" || normKey.toLowerCase() === "alarm number") continue;

      const v = row[rawKey];
      if (typeof v !== "string") continue;

      const sv = v.trim();
      const sev = severityMap[sv] || 0;

      updateFaultState(
        active,
        faults,
        normKey,
        alarmMapping[normKey] || normKey,
        sev,
        sv,
        t,
        snapshotProvider
      );
    }
  }

  const last = timeSeries[timeSeries.length - 1];
  if (last && last.time) closeAllOpenFaults(active, last.time, faults);

  return { timeSeries, faults };
}

/* =========================
   Tailwind highlight mapping
   ========================= */

export const highlightClass = {
  red: "text-red-400 font-semibold",
  orange: "text-orange-400 font-semibold",
  amber: "text-amber-400 font-semibold",
  emerald: "text-emerald-400 font-semibold",
  cyan: "text-cyan-400 font-semibold",
  slate: "text-slate-300 font-semibold"
};
