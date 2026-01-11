// Script to decode HWID and extract relay names
import XLSX from 'xlsx';

const problemFile = 'Individual cells not showing on charts line graph.xlsx';
const goodFile = 'Batt Info SHOWING GOOD.xlsx';

console.log('=== HWID RELAY NAME DECODER ===\n');

// Function to decode HWID to relay names
// Based on the HWID format: each byte pair represents relay configuration
function decodeHWIDRelayNames(hwid) {
  if (!hwid || typeof hwid !== 'string') {
    return null;
  }

  // HWID is a hex string like "F3E052A1C501000047620000FF4453A1"
  // The relay names are encoded in specific byte positions
  // This is based on reverse engineering the format

  try {
    // Convert hex string to bytes
    const bytes = [];
    for (let i = 0; i < hwid.length; i += 2) {
      bytes.push(parseInt(hwid.substr(i, 2), 16));
    }

    console.log('HWID bytes:', bytes);
    console.log('HWID length:', bytes.length);

    // The relay names appear to be encoded in the HWID
    // Each relay position has a byte that indicates its function
    // This is a placeholder - the actual decoding would need the spec

    return {
      rawHWID: hwid,
      bytes: bytes,
      // Placeholder - would need actual decoding spec
      relayNames: [
        'Relay0', 'Relay1', 'Relay2', 'Relay3', 'Relay4', 'Relay5'
      ]
    };
  } catch (e) {
    console.error('Error decoding HWID:', e);
    return null;
  }
}

function analyzeDeviceInfo(filename, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label}: ${filename}`);
  console.log('='.repeat(70));

  try {
    const workbook = XLSX.readFile(filename);

    // Find Device List sheet
    const deviceListSheet = workbook.SheetNames.find(name =>
      name.toLowerCase().includes('device list') || name.includes('0x82')
    );

    if (!deviceListSheet) {
      console.log('ERROR: Device List sheet not found!');
      return;
    }

    console.log(`\nDevice List Sheet: ${deviceListSheet}`);

    const sheet = workbook.Sheets[deviceListSheet];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      console.log('ERROR: No data in Device List sheet!');
      return;
    }

    const row = data[0];
    console.log('\nDevice List Row:', JSON.stringify(row, null, 2));

    // Extract HWID fields
    const hwid1 = row['Hardware Device 1 HWID'];
    const hwid2 = row['Hardware Device 2 HWID'];
    const hwid3 = row['Hardware Device 3 HWID'];
    const deviceCount = row['Hardware Device count'];

    console.log(`\nDevice Count: ${deviceCount}`);
    console.log(`Hardware Device 1 HWID: ${hwid1}`);
    console.log(`Hardware Device 2 HWID: ${hwid2}`);
    console.log(`Hardware Device 3 HWID: ${hwid3}`);

    // Decode each HWID
    if (hwid1) {
      console.log('\n--- Decoding Hardware Device 1 HWID ---');
      const decoded = decodeHWIDRelayNames(hwid1);
      if (decoded) {
        console.log('Decoded relay info:', decoded);
      }
    }

    if (hwid2 && hwid2 !== 0 && hwid2 !== '0') {
      console.log('\n--- Decoding Hardware Device 2 HWID ---');
      const decoded = decodeHWIDRelayNames(hwid2);
      if (decoded) {
        console.log('Decoded relay info:', decoded);
      }
    }

    if (hwid3 && hwid3 !== 0 && hwid3 !== '0') {
      console.log('\n--- Decoding Hardware Device 3 HWID ---');
      const decoded = decodeHWIDRelayNames(hwid3);
      if (decoded) {
        console.log('Decoded relay info:', decoded);
      }
    }

    // Check Device Info sheet too
    const deviceInfoSheet = workbook.SheetNames.find(name =>
      name.toLowerCase().includes('device info') || name.includes('0x92')
    );

    if (deviceInfoSheet) {
      console.log(`\n\nDevice Info Sheet: ${deviceInfoSheet}`);
      const infoSheet = workbook.Sheets[deviceInfoSheet];
      const infoData = XLSX.utils.sheet_to_json(infoSheet);

      if (infoData.length > 0) {
        console.log('\nDevice Info Row:', JSON.stringify(infoData[0], null, 2));
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

// Analyze both files
analyzeDeviceInfo(problemFile, 'PROBLEM FILE');

try {
  console.log('\n\n');
  analyzeDeviceInfo(goodFile, 'GOOD FILE');
} catch (e) {
  console.log('\nGood file not available for comparison');
}

console.log('\n\n=== ANALYSIS COMPLETE ===');
console.log('\nKEY OBSERVATIONS:');
console.log('1. Check if Device Count differs between files');
console.log('2. Check if HWID format/length differs between files');
console.log('3. The relay names are likely encoded in the HWID bytes');
console.log('4. If Device Count = 2 but there are 3 HWIDs shown, that may cause duplicate relay names');
