// Test script to simulate the App.jsx data processing
import XLSX from 'xlsx';

const problemFile = 'Individual cells not showing on charts line graph.xlsx';

console.log('=== SIMULATING APP.JSX DATA PROCESSING ===\n');

// Utility functions from App.jsx
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

// Load workbook
const wb = XLSX.readFile(problemFile);
const sheets = {};
wb.SheetNames.forEach(name => {
  sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
});

console.log('Loaded sheets:', Object.keys(sheets).join(', '));

// Process voltages
const voltages = findSheet(sheets, 'voltage', '0x9a');
console.log(`\nVoltage sheet rows: ${voltages.length}`);

const dataMap = new Map();

// Process first 5 rows
voltages.slice(0, 5).forEach((row, rowIdx) => {
  const t = parseDate(getVal(row, 'Time'));
  if (!t) {
    console.log(`Row ${rowIdx}: No valid time`);
    return;
  }

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

  // Extract ALL cell voltages
  let cellCount = 0;
  Object.keys(row).forEach(k => {
    const m = cleanKey(k).match(/Cell volt\.N\+(\d+)/i);
    if (m) {
      const cellIdx = parseInt(m[1]);
      const v = parseFloat(row[k]);
      if (!isNaN(v)) {
        e.cells[cellIdx] = v;
        e[`cell${cellIdx}`] = v;
        cellCount++;
      }
    }
  });

  console.log(`\nRow ${rowIdx + 1}:`);
  console.log(`  Time: ${e.timeStr}`);
  console.log(`  Pack V: ${e.packVoltage}`);
  console.log(`  Cells extracted: ${cellCount}`);
  console.log(`  e.cells keys:`, Object.keys(e.cells).slice(0, 10));
  console.log(`  Sample cell values:`, Object.entries(e.cells).slice(0, 5).map(([k,v]) => `cell${k}=${v}`).join(', '));
});

// Now simulate the chartData transformation
console.log('\n\n=== SIMULATING CHART DATA TRANSFORMATION ===\n');

const dataArray = Array.from(dataMap.values());
console.log(`Data array length: ${dataArray.length}`);

if (dataArray.length > 0) {
  const d = dataArray[0];
  console.log('\nFirst data entry:');
  console.log(`  Time: ${d.timeStr}`);
  console.log(`  cells object keys:`, Object.keys(d.cells));
  console.log(`  cells object:`, d.cells);

  // Simulate the transformation
  const cellVoltages = {};
  if (d.cells) {
    Object.entries(d.cells).forEach(([k, v]) => {
      const cellIdx = parseInt(k, 10);
      if (!isNaN(cellIdx) && v != null) {
        if (v >= 1000 && v <= 5000) {
          cellVoltages[`cell${cellIdx}`] = v;
        }
      }
    });
  }

  console.log('\nTransformed cell voltages:');
  console.log(`  Keys:`, Object.keys(cellVoltages));
  console.log(`  Count:`, Object.keys(cellVoltages).length);
  console.log(`  Sample values:`, Object.entries(cellVoltages).slice(0, 5).map(([k,v]) => `${k}=${v}`).join(', '));

  const chartEntry = {
    time: d.timeStr,
    packV: d.packVoltage,
    ...cellVoltages
  };

  console.log('\nFinal chart entry keys:', Object.keys(chartEntry));
  console.log('Cell-related keys:', Object.keys(chartEntry).filter(k => k.startsWith('cell')));
}

console.log('\n\n=== ANALYSIS COMPLETE ===');
