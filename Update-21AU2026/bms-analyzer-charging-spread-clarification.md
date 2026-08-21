# BMS Analyzer: Charging Spread Clarification

## IMPORTANT CORRECTION

**The "fan-out and converge" pattern during charging is NORMAL behavior and should NOT be flagged as an anomaly.**

This document supersedes any conflicting guidance in the previous anomaly detection spec.

---

## The Healthy Charging Pattern

### What It Looks Like

```
Cell Voltages During Charge Cycle:

3550mV ─────────────────────╮
                        ╱╲   │ ← Cells "fan out" during CC
3500mV               ╱    ╲  │    (80-120mV spread is NORMAL)
                   ╱        ╲│
3450mV ──────────╱           ╲___________
                ╱                        ╲
3400mV ───────╱                           ╲_______ ← Converge at rest
             ╱                                     (<30mV spread)
3350mV ────╱
           │         │              │            │
        CC Start   CC Peak      CV Phase       Rest
```

### Why This Happens (Not a Defect)

During charging, the **measured** cell voltage includes an IR (internal resistance) component:

```
V_measured = V_actual + (I_charge × R_internal)
```

| Factor | Effect |
|--------|--------|
| **Same current through all cells** | Series connection ensures identical current |
| **Different internal resistance per cell** | Normal manufacturing variation (±5-10%) |
| **IR voltage adds to measured voltage** | Higher IR cell reads higher during charge |
| **At rest (I=0), IR component = 0** | True cell voltage revealed |

### The Key Insight

**A 100mV spread during high-current charging that converges to <30mV at rest is a HEALTHY pack.**

The spread is not imbalance — it's just physics. The convergence proves the cells are actually balanced.

---

## Revised Diagnostic Logic

### DO NOT Flag These as Anomalies

| Observation | Why It's Normal |
|-------------|-----------------|
| 80-150mV spread during CC charging | IR-based offset, temporary |
| Cells "fan out" as charging current increases | IR × I effect |
| Cells "converge" as charging current decreases | IR component diminishing |
| Spread disappears at rest | IR component = 0 when I = 0 |
| One cell consistently reads higher during charge | That cell has slightly higher IR (normal) |

### DO Flag These as Potential Issues

| Observation | What It Indicates |
|-------------|-------------------|
| **>50mV spread persists at REST** | True cell capacity/voltage imbalance |
| One cell hits max voltage significantly before others | Capacity imbalance (weak cell) |
| Spread at rest grows over multiple cycles | Cell degradation in progress |
| Cells don't converge after charging (>30 min rest) | True imbalance requiring attention |
| One cell diverges dramatically (>200mV from others) | Possible cell failure |

---

## Corrected Threshold Table

### Cell Imbalance Thresholds (Revised)

| Operating State | IGNORE (Normal) | INFO | WARNING | CRITICAL |
|-----------------|-----------------|------|---------|----------|
| **REST (>15 min, <0.5A)** | <20mV | 20-35mV | 35-50mV | >50mV |
| **Charging CC** | <150mV | — | — | >200mV* |
| **Charging CV** | <80mV | — | — | >120mV* |
| **Discharging** | <120mV | — | — | >180mV* |

*Only flag during active charge/discharge if spread is **extreme** (likely sensor error or cell failure, not normal IR variation)

### Key Change from Previous Spec

**Previous (WRONG):**
```javascript
'CHARGING_CC_HIGH': { info: 60, warning: 120, critical: 180 }
// This would flag normal 100mV charging spread as WARNING ❌
```

**Revised (CORRECT):**
```javascript
'CHARGING_CC_HIGH': { ignore: 150, critical: 200 }
// Normal charging spread is ignored; only extreme outliers flagged ✓
```

---

## Implementation: State-Aware Flagging

### Only Analyze Imbalance at Rest

```javascript
const shouldAnalyzeCellBalance = (state, currentAmps, restDurationMinutes) => {
  // Only perform imbalance analysis when pack is truly at rest
  if (Math.abs(currentAmps) > 0.5) {
    return false; // Charging or discharging — skip imbalance check
  }
  
  if (restDurationMinutes < 15) {
    return false; // Not settled yet — voltages still stabilizing
  }
  
  return true; // Pack at rest and settled — this is the true reading
};
```

### Convergence Check (The Real Test)

Instead of flagging spread during charging, check whether cells **converge** after charging:

```javascript
const checkConvergence = (dataPoints) => {
  // Find the last charging period
  const lastChargeEnd = findLastChargeEnd(dataPoints);
  if (!lastChargeEnd) return null;
  
  // Get spread at end of charging
  const spreadAtChargeEnd = getCellSpread(lastChargeEnd);
  
  // Get spread 15-30 minutes after charging stopped
  const restPoint = findRestPoint(dataPoints, lastChargeEnd, 15); // 15 min later
  if (!restPoint) return null;
  
  const spreadAtRest = getCellSpread(restPoint);
  
  // Calculate convergence ratio
  const convergenceRatio = spreadAtRest / spreadAtChargeEnd;
  
  return {
    spreadDuringCharge: spreadAtChargeEnd,
    spreadAtRest: spreadAtRest,
    convergenceRatio: convergenceRatio,
    healthy: convergenceRatio < 0.4 && spreadAtRest < 50 // Converged to <40% of charge spread, and <50mV absolute
  };
};
```

### Example Analysis Output

```
Charge Cycle Analysis:
  Spread at CC peak:     98mV   (normal for charging)
  Spread at rest (+20m): 24mV   (excellent convergence)
  Convergence ratio:     24.5%  ✓
  
  Assessment: HEALTHY PACK
  - Cells exhibit normal IR-based spread during charge
  - Cells converge properly at rest
  - No imbalance flagged
```

---

## Visual Indicator for UI

### Healthy Pattern Recognition

When the analyzer detects the "fan-out and converge" pattern, show a **positive indicator** instead of false warnings:

```
┌─────────────────────────────────────────────────────────────┐
│ ✓ Cell Balance: HEALTHY                                     │
│                                                              │
│   Charging spread: 98mV (normal IR variation)               │
│   Rest spread: 24mV (excellent)                             │
│   Convergence: 75% reduction ✓                              │
│                                                              │
│   Note: Spread during charging is expected behavior and     │
│   does not indicate cell imbalance.                         │
└─────────────────────────────────────────────────────────────┘
```

### Only Show Warning If Rest Spread is High

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠ Cell Balance: ATTENTION NEEDED                            │
│                                                              │
│   Charging spread: 145mV                                    │
│   Rest spread: 67mV (elevated)                              │
│   Convergence: 54% reduction                                │
│                                                              │
│   Warning: Spread does not fully resolve at rest.           │
│   Recommend: Monitor over next 2-3 charge cycles.           │
│   If persistent, passive balancing may be needed.           │
└─────────────────────────────────────────────────────────────┘
```

---

## Summary

| Previous Behavior | Corrected Behavior |
|-------------------|-------------------|
| Flagged 100mV spread during CC as WARNING | Ignores normal charging spread |
| Counted every sample as separate anomaly | Only analyzes rest-state data |
| No convergence analysis | Checks if cells converge after charge |
| False positives during healthy operation | Only flags true rest-state imbalance |

**The analyzer should CELEBRATE the fan-out-and-converge pattern as evidence of pack health, not flag it as a problem.**

---

## Appendix: Test Cases

### Test Case 1: Healthy Pack (Should Pass)
- CC charging spread: 110mV
- CV charging spread: 45mV
- Rest spread (20 min): 22mV
- **Result: HEALTHY ✓**

### Test Case 2: Marginal Pack (Should Advise)
- CC charging spread: 130mV
- CV charging spread: 70mV
- Rest spread (20 min): 48mV
- **Result: INFO — Monitor trending**

### Test Case 3: Imbalanced Pack (Should Warn)
- CC charging spread: 160mV
- CV charging spread: 95mV
- Rest spread (20 min): 72mV
- **Result: WARNING — Imbalance detected**

### Test Case 4: Failing Cell (Should Alert)
- One cell hits 3.65V while others at 3.45V during CC
- Same cell at 3.42V at rest, others at 3.38V
- Spread not proportional to current (not IR-based)
- **Result: CRITICAL — Cell capacity imbalance**
