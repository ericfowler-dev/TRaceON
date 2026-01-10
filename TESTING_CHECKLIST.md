# BMS Analyzer - Testing Checklist

## Date: 2026-01-09

## Test Files Available
1. ✅ BMS Log File Example.xlsx
2. ✅ BMS Log File Example_01.xlsx
3. ✅ BMS Log File Example_2.xlsx
4. ✅ 37504A4521063938040A16324E2B100F_20250114114310.xlsx
5. ✅ 34504A45170A31381209163539031C17_20251223085259.xlsx
6. ✅ 34504A45170A31381209163539031C17_20251217115303.xlsx

---

## Critical Fixes to Verify

### 1. Relay Parsing Error - FIXED
**Expected Result**: No more "Cannot set properties of undefined (setting 'Relay0')" errors

**Test Steps**:
- [ ] Upload each file one by one
- [ ] Verify file parses without console errors
- [ ] Check that relay status section displays correctly
- [ ] Verify relays show correct ON/OFF/STICKING states

**Known Data**:
- File 1: Relay 3 should show "Close" (ON) 637 times during discharging
- File 1: Relay 0, 1, 5 should show activity
- File 1: Relay 2, 4 remain OFF

---

### 2. Temperature Data Display - FIXED
**Expected Result**: Temperature charts show actual values (13-49°C range), NOT 1°C

**Test Steps**:
- [ ] Upload BMS Log File Example.xlsx
- [ ] Go to Charts tab
- [ ] Check "All Temperatures" chart
- [ ] Verify values range from ~13°C to ~49°C
- [ ] Go to Snapshot tab
- [ ] Verify temperature cards show real values

**Known Data**:
- Real temperature ranges: 13-49°C
- Temperature probes: 8 or 9 sensors depending on file

---

### 3. Heat Map Visualization - NEW FEATURE
**Expected Result**: Cell voltages display with color-coded heat map

**Test Steps**:
- [ ] Upload any file
- [ ] Go to Snapshot tab
- [ ] Scroll to "Cell Voltages (mV) - Heat Map" section
- [ ] Verify heat map legend shows: LOW | BELOW | GOOD | ABOVE | HIGH
- [ ] Verify cells are color-coded:
  - Orange = LOW (bottom 10%)
  - Yellow = BELOW (10-40%)
  - Green = GOOD (40-60%)
  - Cyan = ABOVE (60-90%)
  - Blue = HIGH (top 10%)
- [ ] Verify min/max/Δ values displayed at bottom

---

### 4. Large Status Pill - NEW FEATURE
**Expected Result**: Prominent gradient pill shows Charging/Discharging status

**Test Steps**:
- [ ] Upload file with charging data
- [ ] Go to Snapshot tab
- [ ] Verify large status pill appears at top
- [ ] Check for:
  - [ ] Large icon with ring effect
  - [ ] "CHARGING" or "DISCHARGING" in large text (4xl font)
  - [ ] Green gradient for Charging
  - [ ] Orange gradient for Discharging
  - [ ] Pack voltage, current, SOC, SOH displayed on right side

---

### 5. Enhanced Snapshot Section - ENHANCED
**Expected Result**: Snapshot tab shows 15+ new data fields

**New Data Points to Verify**:
- [ ] Real SOC (separate from Shown SOC)
- [ ] Max/Min Cell IDs (not just values)
- [ ] Max/Min Temp IDs (sensor numbers)
- [ ] Temperature Delta (Δ)
- [ ] Heartbeat counter
- [ ] Power Voltage
- [ ] Reset Source
- [ ] Wakeup Signal
- [ ] SW1, SW2, DI1, DI2
- [ ] Acc. Voltage (if available)
- [ ] HV measurements (HVBPOS, HV1-5)
- [ ] Diagnostic fault flags

---

### 6. Enhanced Faults Section - ENHANCED
**Expected Result**: Fault cards show 27+ diagnostic fields

**Fault Snapshot Fields to Verify**:
- [ ] Pack V, Current, Shown SOC, Real SOC, SOH
- [ ] System State
- [ ] Cell Δ
- [ ] Max Cell V with Cell ID
- [ ] Min Cell V with Cell ID
- [ ] Max Temp with Sensor ID
- [ ] Min Temp with Sensor ID
- [ ] Temp Δ
- [ ] SW1, SW2, DI1, DI2
- [ ] Heartbeat
- [ ] Power V
- [ ] System Insulation
- [ ] Positive Insulation
- [ ] Negative Insulation
- [ ] Reset Source
- [ ] Wakeup Signal
- [ ] Acc V (conditional)
- [ ] Chg Diag (conditional)
- [ ] Dchg Diag (conditional)

---

### 7. STICKING Relay State - NEW FEATURE
**Expected Result**: Relay in "Sticking" state shows red warning

**Test Steps**:
- [ ] Check if any files have "Sticking" relay states
- [ ] If found, verify:
  - [ ] Red background on relay indicator
  - [ ] AlertTriangle icon displayed
  - [ ] Red pulsing animation
  - [ ] "STICKING" label in red text

---

## File-Specific Tests

### File 1: BMS Log File Example.xlsx
**Known Data**:
- Cells: 24
- Temperatures: 8 sensors
- Relay 3: 637 instances of "Close" (ON)
- Cell Balancing: Cells 1, 8, 14, 17
- Energy: Charged 86 AH (Total: 6813 AH), Discharged 0 AH (Total: 6603 AH)
- Efficiency: ~97%

**Tests**:
- [ ] Verify 24 cell voltages display
- [ ] Verify 8 temperature sensors
- [ ] Verify Relay 3 shows ON during discharging
- [ ] Verify cell balancing indicators on cells 1, 8, 14, 17
- [ ] Verify energy stats match above

---

### File 2: BMS Log File Example_01.xlsx
**Tests**:
- [ ] Verify no parsing errors
- [ ] Check if cell count differs (24 vs 32)
- [ ] Verify temperature data displays correctly
- [ ] Check for any unique data patterns

---

### File 3: BMS Log File Example_2.xlsx
**Tests**:
- [ ] Verify no parsing errors
- [ ] Check relay states
- [ ] Verify temperature ranges
- [ ] Check for charging/discharging cycles

---

### File 4: 37504A4521063938040A16324E2B100F_20250114114310.xlsx
**Tests**:
- [ ] Verify no parsing errors
- [ ] Check system state data
- [ ] Verify all tabs load correctly

---

### File 5: 34504A45170A31381209163539031C17_20251223085259.xlsx
**Known Issue**: Previous analysis showed corrupt data (0mV and 65V readings)

**Tests**:
- [ ] Verify file parses without crashing
- [ ] Check if error handling displays corrupt data appropriately
- [ ] Verify heat map handles edge cases

---

### File 6: 34504A45170A31381209163539031C17_20251217115303.xlsx
**Tests**:
- [ ] Verify no parsing errors
- [ ] Compare with File 5 (same device ID, different date)
- [ ] Check for data consistency

---

## Regression Tests

### Overview Tab
- [ ] Device info card displays
- [ ] 6 metric cards show stats
- [ ] Mini charts render (Cell Voltage Range, Temperature Range)
- [ ] Anomaly banner appears if anomalies detected
- [ ] Issues summary list displays faults

### Charts Tab
- [ ] Pack Voltage & SOC chart renders
- [ ] All Cell Voltages chart shows all cells
- [ ] Cell Imbalance (Δ) chart displays
- [ ] Brush controls work for zooming
- [ ] Thermal Zones chart shows temperature data

### Faults Tab
- [ ] Anomalies section displays (if any)
- [ ] BMS fault events listed with severity
- [ ] Fault snapshots show all 27+ fields
- [ ] Relay status indicators work in fault cards

### Snapshot Tab
- [ ] Time search box functional
- [ ] Playback controls work (play/pause/skip/seek)
- [ ] Large status pill displays
- [ ] System Details card shows all new fields
- [ ] Relay Status section displays all 6 relays
- [ ] Cell Voltages heat map renders correctly
- [ ] Temperatures card displays all sensors
- [ ] Energy tracking displays (if available)
- [ ] Charging data displays (if charger connected)

### Raw Tab
- [ ] Expandable sheet list
- [ ] Sample data displays
- [ ] Sheet stats show (rows, time range)

---

## Performance Tests

- [ ] Large files (>1000 rows) parse without hanging
- [ ] UI remains responsive during playback
- [ ] Heat map calculations don't slow down rendering
- [ ] Switching between tabs is smooth

---

## Edge Cases

- [ ] Files with missing sheets (no Charging/Balancing data)
- [ ] Files with 24 cells vs 32 cells
- [ ] Files with 8 temps vs 9 temps
- [ ] Files with corrupt/invalid data
- [ ] Empty or null values handled gracefully
- [ ] Very large voltage deltas
- [ ] Temperature extremes

---

## Browser Console Checks

- [ ] No errors in console after file upload
- [ ] No warnings about undefined properties
- [ ] No relay parsing errors
- [ ] No temperature parsing errors

---

## Visual Inspection

- [ ] All cards have proper spacing (p-5)
- [ ] Icons are larger (w-5 h-5)
- [ ] Grid gaps are consistent (gap-5)
- [ ] Heat map colors are distinct
- [ ] Status pill is prominent
- [ ] Relay indicators are easy to see
- [ ] Balancing indicators (cyan dots) are visible
- [ ] Font sizes are appropriate
- [ ] Dark theme is consistent

---

## Sign-Off

**Tested By**: _______________
**Date**: _______________

**Overall Status**:
- [ ] All Critical Fixes Verified
- [ ] All New Features Working
- [ ] No Regression Issues
- [ ] Ready for Production

**Notes**:
_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________
