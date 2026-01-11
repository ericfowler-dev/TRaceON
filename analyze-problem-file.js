// Script to analyze the problem BMS log file
import XLSX from 'xlsx';
import path from 'path';

const problemFile = 'Individual cells not showing on charts line graph.xlsx';
const goodFile = 'Batt Info SHOWING GOOD.xlsx';

console.log('=== ANALYZING BMS LOG FILE ISSUES ===\n');

function analyzeFile(filename, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label}: ${filename}`);
  console.log('='.repeat(70));

  const workbook = XLSX.readFile(filename);

  console.log(`\nSheet Names: ${workbook.SheetNames.join(', ')}`);

  // Check for Device Info sheets
  const deviceInfoSheet = workbook.SheetNames.find(name =>
    name.toLowerCase().includes('device info') || name.includes('0x92')
  );
  const deviceListSheet = workbook.SheetNames.find(name =>
    name.toLowerCase().includes('device list') || name.includes('0x82')
  );
  const voltageSheet = workbook.SheetNames.find(name =>
    name.toLowerCase().includes('voltage') || name.includes('0x9a')
  );

  console.log(`\nDevice Info Sheet: ${deviceInfoSheet || 'NOT FOUND'}`);
  console.log(`Device List Sheet: ${deviceListSheet || 'NOT FOUND'}`);
  console.log(`Voltage Sheet: ${voltageSheet || 'NOT FOUND'}`);

  // Analyze Device Info (0x92) - for relay names
  if (deviceInfoSheet) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log('DEVICE INFO 0x92 SHEET ANALYSIS');
    console.log('─'.repeat(70));
    const sheet = workbook.Sheets[deviceInfoSheet];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log(`\nTotal rows: ${data.length}`);

    // Show first 10 rows
    console.log('\nFirst 10 rows (raw):');
    data.slice(0, 10).forEach((row, idx) => {
      console.log(`Row ${idx}:`, JSON.stringify(row));
    });

    // Parse as objects
    const objData = XLSX.utils.sheet_to_json(sheet);
    console.log(`\nParsed rows as objects: ${objData.length}`);
    if (objData.length > 0) {
      console.log('Column names:', Object.keys(objData[0]));
      console.log('\nFirst 3 data rows:');
      objData.slice(0, 3).forEach((row, idx) => {
        console.log(`Row ${idx}:`, JSON.stringify(row, null, 2));
      });
    }
  }

  // Analyze Device List (0x82)
  if (deviceListSheet) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log('DEVICE LIST 0x82 SHEET ANALYSIS');
    console.log('─'.repeat(70));
    const sheet = workbook.Sheets[deviceListSheet];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log(`\nTotal rows: ${data.length}`);

    // Show first 10 rows
    console.log('\nFirst 10 rows (raw):');
    data.slice(0, 10).forEach((row, idx) => {
      console.log(`Row ${idx}:`, JSON.stringify(row));
    });

    // Parse as objects
    const objData = XLSX.utils.sheet_to_json(sheet);
    console.log(`\nParsed rows as objects: ${objData.length}`);
    if (objData.length > 0) {
      console.log('Column names:', Object.keys(objData[0]));
      console.log('\nFirst 3 data rows:');
      objData.slice(0, 3).forEach((row, idx) => {
        console.log(`Row ${idx}:`, JSON.stringify(row, null, 2));
      });
    }
  }

  // Analyze Voltage sheet (0x9A) - for cell voltages
  if (voltageSheet) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log('VOLTAGE 0x9A SHEET ANALYSIS');
    console.log('─'.repeat(70));
    const sheet = workbook.Sheets[voltageSheet];

    // Get raw data with headers
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log(`\nTotal rows: ${data.length}`);

    if (data.length > 0) {
      console.log('\nHeader row:');
      console.log(JSON.stringify(data[0]));

      // Show first few data rows
      console.log('\nFirst 5 data rows:');
      data.slice(1, 6).forEach((row, idx) => {
        console.log(`Row ${idx + 1}:`, JSON.stringify(row.slice(0, 20))); // First 20 columns
      });
    }

    // Parse as objects to find cell voltage columns
    const objData = XLSX.utils.sheet_to_json(sheet);
    console.log(`\nParsed rows as objects: ${objData.length}`);

    if (objData.length > 0) {
      const firstRow = objData[0];
      const allKeys = Object.keys(firstRow);

      console.log(`\nTotal columns: ${allKeys.length}`);

      // Find cell voltage columns
      const cellVoltageKeys = allKeys.filter(k =>
        k.toLowerCase().includes('cell') && k.toLowerCase().includes('volt')
      );

      console.log(`\nCell voltage columns found: ${cellVoltageKeys.length}`);
      console.log('Cell voltage column names:', cellVoltageKeys);

      // Check if cell voltage data exists
      if (cellVoltageKeys.length > 0) {
        console.log('\nSample cell voltage values from first row:');
        cellVoltageKeys.slice(0, 5).forEach(key => {
          console.log(`  ${key}: ${firstRow[key]}`);
        });

        // Check for non-empty values
        const nonEmptyCells = cellVoltageKeys.filter(key => {
          const val = firstRow[key];
          return val !== undefined && val !== null && val !== '';
        });
        console.log(`\nNon-empty cell voltage columns: ${nonEmptyCells.length} out of ${cellVoltageKeys.length}`);
      }

      // Show all column names
      console.log('\nAll column names:');
      allKeys.forEach((key, idx) => {
        console.log(`  ${idx + 1}. ${key}`);
      });
    }
  }
}

try {
  // Analyze the problem file
  analyzeFile(problemFile, 'PROBLEM FILE');

  // Compare with good file if it exists
  try {
    console.log('\n\n');
    analyzeFile(goodFile, 'GOOD FILE (for comparison)');
  } catch (e) {
    console.log('\nGood file not available for comparison');
  }
} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
}
