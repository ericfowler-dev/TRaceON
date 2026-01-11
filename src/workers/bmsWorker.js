import * as XLSX from 'xlsx';
import { processData } from '../lib/processData';

let workbook = null;

const neededTerms = [
  'voltage', '0x9a',
  'temperature', '0x09',
  'peak', '0x9b',
  'system state', '0x93',
  'alarm', '0x87',
  'device info', '0x92',
  'device list', '0x82',
  'balancing', '0x86',
  'energy', '0x89',
  'charging', '0x99'
];

const shouldKeepSheet = (name) => {
  const lower = name.toLowerCase();
  for (let i = 0; i < neededTerms.length; i++) {
    if (lower.includes(neededTerms[i])) return true;
  }
  return false;
};

self.onmessage = (event) => {
  const { type, buffer, name } = event.data || {};
  try {
    if (type === 'load') {
      const data = new Uint8Array(buffer);
      workbook = XLSX.read(data, {
        type: 'array',
        cellDates: true,
        cellNF: false,
        cellText: false,
        sheetStubs: false
      });

      const sheets = {};
      for (let i = 0; i < workbook.SheetNames.length; i++) {
        const sheetName = workbook.SheetNames[i];
        if (!shouldKeepSheet(sheetName)) continue;
        const sheet = workbook.Sheets[sheetName];
        sheets[sheetName] = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
      }

      const result = processData(sheets);
      self.postMessage({
        type: 'loaded',
        sheetNames: workbook.SheetNames,
        ...result
      });
      return;
    }

    if (type === 'rawSheet') {
      if (!workbook) {
        self.postMessage({ type: 'error', message: 'Workbook not loaded yet.' });
        return;
      }
      const sheet = workbook.Sheets[name];
      if (!sheet) {
        self.postMessage({ type: 'rawSheet', name, rows: [] });
        return;
      }
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
      self.postMessage({ type: 'rawSheet', name, rows });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
