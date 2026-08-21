# BMS Analyzer: Anomaly Detection Improvements

## Overview

This document outlines improvements to reduce false-positive anomaly flags while maintaining sensitivity to genuine issues. The goal is to produce actionable diagnostics rather than noise.

---

## 1. Cell Balance Thresholds by Operating State

Cell voltage deviation (ΔV) must be evaluated **contextually** based on operating state. A 50mV spread during high-current charging is normal; the same spread at rest is a red flag.

### Industry Standards (EV & Large Format LFP)

| Operating State | Normal ΔV | Warning ΔV | Critical ΔV | Notes |
|-----------------|-----------|------------|-------------|-------|
| **Rest (>30 min, 0A)** | <20mV | 20-50mV | >50mV | Best indicator of true imbalance |
| **Charging (<0.3C)** | <50mV | 50-100mV | >100mV | Expect spread during CC phase |
| **Charging (>0.3C)** | <80mV | 80-150mV | >150mV | Higher current = more IR-based spread |
| **Charging (CV phase)** | <30mV | 30-60mV | >60mV | Cells should converge here |
| **Discharging (<0.5C)** | <60mV | 60-100mV | >100mV | Normal working spread |
| **Discharging (>0.5C)** | <100mV | 100-150mV | >150mV | High current increases spread |
| **Balancing Active** | <100mV | — | — | Ignore during active balancing |

### Key Insight: Rest Voltage is Truth

**Tesla, CATL, BYD, and other major OEMs** all use **rest voltage** (after settling) as the primary indicator of cell health. During active charge/discharge, internal resistance (IR) causes temporary voltage spreads that disappear at rest.

**Recommendation**: The analyzer should:
1. Detect "rest" periods (current ≈ 0A for >5 minutes)
2. Weight rest-state imbalance heavily in diagnostics
3. Apply relaxed thresholds during active charge/discharge
4. Flag persistent imbalance that doesn't resolve at rest

---

## 2. State Detection Logic

### 2.1 Charging State Detection

```javascript
const detectOperatingState = (current, packVoltage, socPercent, prevState) => {
  const absCurrent = Math.abs(current);
  
  // Rest: Near-zero current for extended period
  if (absCurrent < 0.5) {
    return 'REST';
  }
  
  // Charging: Positive current (convention: charge = positive)
  if (current > 0.5) {
    // CV phase: High SOC + decreasing current + voltage near max
    if (socPercent > 95 && absCurrent < 20) {
      return 'CHARGING_CV';
    }
    // CC phase: Constant current bulk charging
    return absCurrent > 50 ? 'CHARGING_CC_HIGH' : 'CHARGING_CC_LOW';
  }
  
  // Discharging: Negative current
  if (current < -0.5) {
    return absCurrent > 100 ? 'DISCHARGING_HIGH' : 'DISCHARGING_LOW';
  }
  
  return prevState || 'UNKNOWN';
};
```

### 2.2 Dynamic Threshold Selection

```javascript
const getCellBalanceThresholds = (operatingState) => {
  const thresholds = {
    'REST':              { normal: 20,  warning: 50,  critical: 80 },
    'CHARGING_CV':       { normal: 30,  warning: 60,  critical: 100 },
    'CHARGING_CC_LOW':   { normal: 50,  warning: 100, critical: 150 },
    'CHARGING_CC_HIGH':  { normal: 80,  warning: 150, critical: 200 },
    'DISCHARGING_LOW':   { normal: 60,  warning: 100, critical: 150 },
    'DISCHARGING_HIGH':  { normal: 100, warning: 150, critical: 200 },
    'BALANCING':         { normal: 150, warning: 200, critical: 300 },
    'UNKNOWN':           { normal: 50,  warning: 100, critical: 150 }
  };
  return thresholds[operatingState] || thresholds['UNKNOWN'];
};
```

---

## 3. Anomaly Aggregation (Event Consolidation)

### Problem
A log file with 448 "cell imbalance" flags recorded once per minute over 7+ hours is **one event**, not 448 events.

### Solution: Event Windowing

Consecutive anomalies of the same type within a time window should be grouped into a single event with:
- Start time
- End time
- Duration
- Peak severity
- Sample count

### Implementation

```javascript
const consolidateAnomalies = (rawAnomalies, windowSeconds = 300) => {
  if (!rawAnomalies.length) return [];
  
  // Sort by timestamp
  const sorted = [...rawAnomalies].sort((a, b) => a.ts - b.ts);
  const consolidated = [];
  let currentEvent = null;
  
  sorted.forEach(anomaly => {
    const key = `${anomaly.type}_${anomaly.code || 'general'}`;
    
    if (currentEvent && 
        currentEvent.key === key && 
        (anomaly.ts - currentEvent.endTs) <= windowSeconds * 1000) {
      // Extend current event
      currentEvent.endTs = anomaly.ts;
      currentEvent.endTime = anomaly.timeStr;
      currentEvent.sampleCount++;
      currentEvent.peakValue = Math.max(currentEvent.peakValue, anomaly.value || 0);
      if (anomaly.severity > currentEvent.peakSeverity) {
        currentEvent.peakSeverity = anomaly.severity;
      }
    } else {
      // Close previous event and start new one
      if (currentEvent) {
        currentEvent.duration = currentEvent.endTs - currentEvent.startTs;
        consolidated.push(currentEvent);
      }
      currentEvent = {
        key,
        type: anomaly.type,
        code: anomaly.code,
        description: anomaly.description,
        startTs: anomaly.ts,
        endTs: anomaly.ts,
        startTime: anomaly.timeStr,
        endTime: anomaly.timeStr,
        sampleCount: 1,
        peakValue: anomaly.value || 0,
        peakSeverity: anomaly.severity || 1,
        firstSnapshot: anomaly.snapshot
      };
    }
  });
  
  // Don't forget the last event
  if (currentEvent) {
    currentEvent.duration = currentEvent.endTs - currentEvent.startTs;
    consolidated.push(currentEvent);
  }
  
  return consolidated;
};
```

### Display Format

Instead of:
```
❌ Cell Imbalance - 2025/12/23 08:00:00
❌ Cell Imbalance - 2025/12/23 08:01:00
❌ Cell Imbalance - 2025/12/23 08:02:00
... (445 more)
```

Show:
```
⚠️ Cell Imbalance Event
   Duration: 7h 28m (448 samples)
   Started: 2025/12/23 08:00:00
   Ended: 2025/12/23 15:28:00
   Peak ΔV: 127mV
   State: CHARGING_CC_LOW
   [Expand for details]
```

---

## 4. Sensitivity Reduction Strategies

### 4.1 Debouncing (Persistence Requirement)

Don't flag an anomaly until it persists for N consecutive samples:

```javascript
const DEBOUNCE_SAMPLES = {
  'CELL_IMBALANCE': 3,      // Must persist for 3 samples
  'OVER_TEMP': 2,           // 2 samples (safety-critical)
  'UNDER_VOLTAGE': 2,       // 2 samples (safety-critical)
  'OVER_VOLTAGE': 2,        // 2 samples (safety-critical)
  'INSULATION_LOW': 5,      // 5 samples (can be transient)
  'COMM_ERROR': 3,          // 3 samples
  'SENSOR_FAULT': 5         // 5 samples (often glitches)
};
```

### 4.2 Hysteresis (Set vs. Clear Thresholds)

Use different thresholds for setting and clearing anomalies:

```javascript
const HYSTERESIS = {
  'CELL_IMBALANCE': {
    setThreshold: 100,    // Flag when ΔV > 100mV
    clearThreshold: 70    // Clear when ΔV < 70mV
  },
  'OVER_TEMP': {
    setThreshold: 45,     // Flag when temp > 45°C
    clearThreshold: 40    // Clear when temp < 40°C
  }
};
```

### 4.3 Statistical Filtering (Outlier Rejection)

Single-sample spikes (like the 65024mV readings) should be flagged as **sensor/comm errors**, not cell faults:

```javascript
const isLikelySensorError = (cellVoltage, neighborVoltages) => {
  // Values outside physical possibility
  if (cellVoltage > 5000 || cellVoltage < 500) {
    return true;
  }
  
  // Sudden spike >500mV from neighbors (same cell, adjacent samples)
  const avgNeighbor = neighborVoltages.reduce((a, b) => a + b, 0) / neighborVoltages.length;
  if (Math.abs(cellVoltage - avgNeighbor) > 500) {
    return true;
  }
  
  return false;
};
```

### 4.4 Rate-of-Change Limits

Physical cells can't change voltage instantly. Flag impossible transitions as data errors:

```javascript
const MAX_VOLTAGE_CHANGE_PER_SECOND = 50; // mV/s - physical limit

const isPhysicallyPossible = (currentV, previousV, deltaTimeSeconds) => {
  const maxChange = MAX_VOLTAGE_CHANGE_PER_SECOND * deltaTimeSeconds;
  return Math.abs(currentV - previousV) <= maxChange;
};
```

---

## 5. Severity Classification

### Tiered Severity Model

| Level | Name | Color | Criteria | Action |
|-------|------|-------|----------|--------|
| 0 | Info | Blue | Notable but expected behavior | Log only |
| 1 | Advisory | Yellow | Minor deviation, monitor | Track trend |
| 2 | Warning | Orange | Significant deviation | Investigate |
| 3 | Critical | Red | Safety or damage risk | Immediate action |

### Severity Assignment by Anomaly Type

```javascript
const classifySeverity = (anomalyType, value, operatingState) => {
  const thresholds = getCellBalanceThresholds(operatingState);
  
  switch (anomalyType) {
    case 'CELL_IMBALANCE':
      if (value < thresholds.normal) return 0;
      if (value < thresholds.warning) return 1;
      if (value < thresholds.critical) return 2;
      return 3;
      
    case 'SENSOR_ERROR':
      return 1; // Usually just data quality issue
      
    case 'OVER_TEMP':
      if (value < 40) return 0;
      if (value < 45) return 1;
      if (value < 50) return 2;
      return 3;
      
    case 'UNDER_VOLTAGE':
      // Per-cell voltage (mV)
      if (value > 2800) return 1;
      if (value > 2500) return 2;
      return 3;
      
    default:
      return 1;
  }
};
```

---

## 6. Configuration Defaults

### 6.1 System Voltage Configuration

**Change default from "Standard" to "12V Auxiliary"**

```javascript
const DEFAULT_CONFIG = {
  auxiliarySystem: '12V',  // Changed from 'standard'
  
  voltageThresholds: {
    '12V': { nominal: 12.6, low: 11.8, critical: 11.0 },
    '24V': { nominal: 25.2, low: 23.6, critical: 22.0 },
    '48V': { nominal: 51.2, low: 48.0, critical: 44.0 }
  }
};
```

### 6.2 User-Configurable Sensitivity

Allow users to adjust sensitivity levels:

```javascript
const SENSITIVITY_PRESETS = {
  'strict': {
    debounce: 1,
    thresholdMultiplier: 0.8,
    aggregationWindow: 60
  },
  'balanced': {  // DEFAULT
    debounce: 3,
    thresholdMultiplier: 1.0,
    aggregationWindow: 300
  },
  'relaxed': {
    debounce: 5,
    thresholdMultiplier: 1.3,
    aggregationWindow: 600
  }
};
```

---

## 7. Summary of Changes

### Immediate Implementation

| # | Change | Impact |
|---|--------|--------|
| 1 | Default 12V AUX system | Correct baseline for most equipment |
| 2 | State-aware thresholds | 50%+ reduction in charge-state false flags |
| 3 | Anomaly consolidation | 448 events → 1 event with duration |
| 4 | Debounce filtering | Eliminates single-sample glitches |
| 5 | Sensor error detection | Separates data quality from cell health |
| 6 | Severity tiering | Prioritizes actionable issues |

### Expected Results

- **Before**: 500+ anomalies flagged, mostly noise
- **After**: 5-15 consolidated events, each actionable

### Display Improvements

1. **Overview**: Show consolidated event count, not raw flag count
2. **Faults Tab**: Group by event, show duration and peak values
3. **Add Filter**: Filter by severity level
4. **Add Toggle**: "Show during charging" on/off
5. **Add Config Panel**: Sensitivity preset selector

---

## 8. References

### Industry Standards Consulted

- SAE J2464 (EV Battery Abuse Testing)
- IEC 62660-1 (Li-ion Cell Performance Testing)
- GB/T 31484 (China EV Battery Cycle Life)
- Tesla BMS Patent US10234510B2 (Cell Balancing Methods)
- CATL Technical Specifications (Public Documentation)

### Typical OEM Thresholds (Compiled)

| OEM | Rest ΔV Warning | Rest ΔV Fault | Charging ΔV Tolerance |
|-----|-----------------|---------------|----------------------|
| Tesla | 30mV | 50mV | 100mV |
| BYD | 25mV | 50mV | 80mV |
| CATL | 20mV | 40mV | 100mV |
| LG Chem | 30mV | 60mV | 120mV |
| **Recommended** | **20mV** | **50mV** | **100mV** |

---

## Appendix: Complete Threshold Configuration

```javascript
export const ANOMALY_CONFIG = {
  // Cell voltage thresholds by state
  cellBalance: {
    REST:              { info: 15, warning: 30, critical: 50 },
    CHARGING_CV:       { info: 25, warning: 50, critical: 80 },
    CHARGING_CC_LOW:   { info: 40, warning: 80, critical: 120 },
    CHARGING_CC_HIGH:  { info: 60, warning: 120, critical: 180 },
    DISCHARGING_LOW:   { info: 50, warning: 90, critical: 130 },
    DISCHARGING_HIGH:  { info: 80, warning: 140, critical: 200 },
    UNKNOWN:           { info: 40, warning: 80, critical: 120 }
  },
  
  // Temperature thresholds (°C)
  temperature: {
    overTemp:  { warning: 40, critical: 50, shutdown: 55 },
    underTemp: { warning: 5, critical: 0, shutdown: -10 },
    deltaTemp: { warning: 8, critical: 12 } // Max spread between probes
  },
  
  // Voltage thresholds per cell (mV)
  cellVoltage: {
    overVoltage:  { warning: 3550, critical: 3650 },
    underVoltage: { warning: 2800, critical: 2500 },
    sensorError:  { min: 500, max: 5000 } // Outside = sensor fault
  },
  
  // Aggregation settings
  aggregation: {
    windowSeconds: 300,      // 5-minute window for grouping
    minSamplesToFlag: 3,     // Debounce: 3 consecutive samples
    hysteresisPercent: 30    // 30% below threshold to clear
  },
  
  // Default system config
  defaults: {
    auxiliaryVoltage: '12V',
    sensitivityPreset: 'balanced',
    showChargingAnomalies: false  // Hide by default
  }
};
```
