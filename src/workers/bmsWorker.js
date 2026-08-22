import * as XLSX from 'xlsx';
import { processData } from '../lib/processData.js';

let workbook = null;
let parsedSheets = null;

const MAX_WORKBOOK_SHEETS = 100;
const MAX_SHEET_ROWS = 250_000;
const MAX_SHEET_COLUMNS = 512;
const MAX_PARSED_CELLS = 5_000_000;

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
  const { type, buffer, name, options } = event.data || {};
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

      if (workbook.SheetNames.length > MAX_WORKBOOK_SHEETS) {
        throw new Error(`Workbook contains ${workbook.SheetNames.length} sheets; maximum supported is ${MAX_WORKBOOK_SHEETS}.`);
      }

      const sheets = Object.create(null);
      let parsedCellBudget = 0;
      for (let i = 0; i < workbook.SheetNames.length; i++) {
        const sheetName = workbook.SheetNames[i];
        if (!shouldKeepSheet(sheetName)) continue;
        const sheet = workbook.Sheets[sheetName];
        if (sheet?.['!ref']) {
          const range = XLSX.utils.decode_range(sheet['!ref']);
          const rowCount = range.e.r - range.s.r + 1;
          const columnCount = range.e.c - range.s.c + 1;
          parsedCellBudget += rowCount * columnCount;
          if (rowCount > MAX_SHEET_ROWS || columnCount > MAX_SHEET_COLUMNS || parsedCellBudget > MAX_PARSED_CELLS) {
            throw new Error(`Workbook structure exceeds safe analysis limits near sheet "${sheetName}".`);
          }
        }
        sheets[sheetName] = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
      }

      parsedSheets = sheets;
      const result = processData(parsedSheets, options);
      self.postMessage({
        type: 'loaded',
        sheetNames: workbook.SheetNames,
        ...result
      });
      return;
    }

    if (type === 'reanalyze') {
      if (!parsedSheets) {
        self.postMessage({ type: 'error', message: 'Workbook not loaded yet.' });
        return;
      }
      const result = processData(parsedSheets, options);
      self.postMessage({
        type: 'loaded',
        sheetNames: workbook?.SheetNames || [],
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
