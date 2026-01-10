// Quick script to compare BMS log file structures
import XLSX from 'xlsx';
import path from 'path';

const goodFile = 'Batt Info SHOWING GOOD.xlsx';
const badFile = 'Batt Info NOT SHOWING_BAD.xlsx';

console.log('=== COMPARING BMS LOG FILES ===\n');

function analyzeFile(filename) {
  console.log(`\n📄 Analyzing: ${filename}`);
  console.log('─'.repeat(60));

  const workbook = XLSX.readFile(filename);

  console.log(`\nSheet Names: ${workbook.SheetNames.join(', ')}`);

  // Check for Device Info sheets
  const deviceInfoSheet = workbook.SheetNames.find(name =>
    name.toLowerCase().includes('device info') || name.includes('0x92')
  );
  const deviceListSheet = workbook.SheetNames.find(name =>
    name.toLowerCase().includes('device list') || name.includes('0x82')
  );

  console.log(`\nDevice Info Sheet: ${deviceInfoSheet || 'NOT FOUND'}`);
  console.log(`Device List Sheet: ${deviceListSheet || 'NOT FOUND'}`);

  // Analyze Device Info
  if (deviceInfoSheet) {
    const sheet = workbook.Sheets[deviceInfoSheet];
    const data = XLSX.utils.sheet_to_json(sheet);
    console.log(`\nDevice Info rows: ${data.length}`);
    if (data.length > 0) {
      console.log('First row keys:', Object.keys(data[0]));
      console.log('First row data:', JSON.stringify(data[0], null, 2));
    }
  }

  // Analyze Device List
  if (deviceListSheet) {
    const sheet = workbook.Sheets[deviceListSheet];
    const data = XLSX.utils.sheet_to_json(sheet);
    console.log(`\nDevice List rows: ${data.length}`);
    if (data.length > 0) {
      console.log('First row keys:', Object.keys(data[0]));
      console.log('First row data:', JSON.stringify(data[0], null, 2));
    }
  }

  // Check Voltage sheet for cell data
  const voltageSheet = workbook.SheetNames.find(name =>
    name.toLowerCase().includes('voltage') || name.includes('0x9a')
  );

  if (voltageSheet) {
    const sheet = workbook.Sheets[voltageSheet];
    const data = XLSX.utils.sheet_to_json(sheet);
    console.log(`\n⚡ Voltage Sheet: ${voltageSheet}`);
    console.log(`Rows: ${data.length}`);
    if (data.length > 0) {
      const firstRow = data[0];
      const cellKeys = Object.keys(firstRow).filter(k =>
        k.toLowerCase().includes('cell') && k.toLowerCase().includes('volt')
      );
      console.log(`Cell voltage columns found: ${cellKeys.length}`);
      console.log('Sample cell keys:', cellKeys.slice(0, 5));
    }
  }
}

try {
  analyzeFile(goodFile);
  console.log('\n\n' + '='.repeat(60));
  analyzeFile(badFile);
} catch (error) {
  console.error('Error:', error.message);
}
