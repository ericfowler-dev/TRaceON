# BMS Log Analysis & Anomaly Detection Implementation Guide
## 80V-105V Lithium-Ion Industrial Battery Systems

---

## Executive Summary

This guide provides comprehensive parameter boundaries and anomaly detection strategies for your BMS GUI application analyzing lithium-ion battery logs. Based on PSI technical training documentation and industry best practices, it establishes **three severity levels** (GOOD/MARGINAL/BAD) for critical operational parameters, enabling early fault detection and preventive maintenance scheduling.

---

## Part 1: Core Parameter Boundaries

### 1.1 CELL VOLTAGE MONITORING

#### LiFePO4 Chemistry Foundation
- **Nominal**: 3.2V per cell
- **Fully Charged Safe Range**: 3.4-3.6V per cell
- **Safe Operating Window**: 2.5V-3.6V per cell
- **Damage Threshold**: Below 2.0V (internal structural degradation)

#### Three-Level Boundary Structure

| Level | Range (V/cell) | GUI Color | Interpretation | Action |
|-------|---|---|---|---|
| **GOOD** | 3.2-3.55 | GREEN | Normal operation, full capacity available | Continue monitoring |
| **MARGINAL** | 3.0-3.2 or 3.55-3.65 | YELLOW | Early stress indicators, trending away from nominal | Increase monitoring frequency, investigate root cause |
| **BAD** | <3.0 or >3.65 | RED | Immediate threat to cell integrity and pack safety | Reduce current limits by 50%, prepare for service |

**Key Considerations:**
- Each cell must be monitored individually via BMS tap wires
- Pack-level voltage should be validated against sum of individual cell voltages
- LiFePO4's flat discharge curve (plateau 20-90% SOC) makes voltage-based SOC estimation challenging below 20% or above 90%

---

### 1.2 CELL VOLTAGE BALANCING & IMBALANCE DETECTION

#### Understanding Normal Spread

**Standard Balancing Capability (PSI Systems):**
- Passive balancing achieves: 17-43mV difference between cells
- Industry benchmark (good condition): <50mV maximum spread
- This should be monitored as a **TREND**, not just an absolute value

#### Three-Level Spread Boundaries

| Level | Max Spread (mV) | Detection Method | Risk Factor | Action |
|-------|---|---|---|---|
| **GOOD** | <30 | Simple min-max calculation | Low | Monitor trends |
| **MARGINAL** | 30-150 | Distance-based outlier detection | Medium-High | Active balancing, investigate weak cells |
| **BAD** | >150 | Time-series anomaly detection | Critical | Reduce charge rate 50%, service soon |

**Implementation Strategy:**
1. **Continuous Monitoring**: Track max voltage - min voltage for every cell group
2. **Trend Analysis**: Calculate moving average of spread over last 50 cycles
3. **Outlier Detection**: Use Z-score method to identify cells >2σ from mean
4. **Rate-of-Change**: Flag when spread increases >10mV per cycle

**Outlier Detection Algorithm:**
```
For each cell in pack:
  z_score = (cell_voltage - mean_voltage) / standard_deviation
  if z_score > 2.0:
    flag_as_marginal()
  if z_score > 3.0:
    flag_as_critical()
```

**Special Consideration - Low SOC Non-Linearity:**
- At low SOC (<20%), cell voltage spread can naturally increase to 100-300mV due to non-linear discharge curve
- Reduce sensitivity of spread monitoring thresholds below 20% SOC
- Use Open Circuit Voltage (OCV) comparison instead of loaded voltage at low SOC

---

### 1.3 PACK-LEVEL VOLTAGE MONITORING

#### System Configuration Mapping

**80V System (24 cells in series):**
- Nominal: 76.8V (3.2V × 24)
- Operating range: 60-85.2V
- Max single cell voltage: 3.55V → 85.2V pack
- Min single cell voltage: 2.5V → 60V pack

**96V System (32 cells in series):**
- Nominal: 102.4V (3.2V × 32)
- Operating range: 80-113.6V
- Max single cell voltage: 3.55V → 113.6V pack
- Min single cell voltage: 2.5V → 80V pack

#### Three-Level Voltage Boundaries (80V System)

| Level | Range (V) | Charge Mode | Discharge Mode | Action |
|-------|---|---|---|---|
| **GOOD** | 76.8-85.2 | Allow full current | Allow full current | Normal operation |
| **MARGINAL** | 72-76.8 or 85.2-90 | Investigate | Investigate | Check cell balance, 50% current limit ready |
| **BAD** | <72 or >90 | Reduce 50% | Reduce 50% | Activate power reduction, schedule service |

#### Three-Level Voltage Boundaries (96V System)

| Level | Range (V) | Charge Mode | Discharge Mode | Action |
|-------|---|---|---|---|
| **GOOD** | 102.4-113.6 | Allow full current | Allow full current | Normal operation |
| **MARGINAL** | 96-102.4 or 113.6-120 | Investigate | Investigate | Check cell balance, 50% current limit ready |
| **BAD** | <96 or >120 | Reduce 50% | Reduce 50% | Activate power reduction, schedule service |

**Monitoring Implementation:**
- Compare pack voltage to sum of 24 (or 32) individual cell measurements
- Difference >0.5V indicates measurement drift or wiring issue
- Track voltage during constant-current phases to detect internal resistance increase

---

### 1.4 TEMPERATURE MONITORING

#### Operating Ranges (PSI Specification)
- **Charging**: 0°C to 55°C
- **Discharging**: -30°C to 60°C
- **Optimal**: 15-35°C (best cycle life and performance)

#### Three-Level Temperature Boundaries

| Level | Range (°C) | Heating/Cooling | State | Action |
|-------|---|---|---|---|
| **GOOD** | 15-40 | None needed | Normal operation | Standard charging/discharge |
| **MARGINAL-Low** | 5-15 | Consider heating | Suboptimal | Monitor, reduce current if <10°C |
| **MARGINAL-High** | 40-50 | Consider cooling | Suboptimal | Monitor, prepare cooling if >45°C |
| **BAD-Low** | <5 | Heating required | Risk of plating | Reduce discharge current 50%, heat before charging |
| **BAD-High** | >50 | Critical cooling | Thermal runaway risk | Reduce current 75%, activate cooling emergency |

#### Temperature Spread Monitoring (Multi-Sensor Systems)

| Level | Max Spread (°C) | Criticality | Root Cause Risk | Action |
|-------|---|---|---|---|
| **GOOD** | <5 | Low | Normal variance | Monitor trends |
| **MARGINAL** | 5-10 | Medium | Module thermal gradient | Investigate heat distribution, check airflow |
| **BAD** | >10 | High | Cell defect or contact resistance | Isolate hot module, service soon |

#### Temperature Rise Rate Monitoring (Rate-of-Change)

This is **critical** for early thermal runaway detection:

| Rate (°C/min) | Level | Condition | Action |
|---|---|---|---|
| <1 | GOOD | Normal thermal response | Continue monitoring |
| 1-2 | MARGINAL | Elevated but manageable | Reduce current, monitor every minute |
| 2-5 | BAD | Significant thermal event | Reduce current 50%, investigate load |
| >5 | CRITICAL | Thermal runaway imminent | Emergency shutdown, safety response |

**Implementation:**
```
Calculate moving window (last 60 seconds):
  temp_rise_rate = (current_temp - temp_60sec_ago) / 60
  if temp_rise_rate > 5°C/min:
    EMERGENCY_SHUTDOWN()
  elif temp_rise_rate > 2°C/min:
    REDUCE_CURRENT_LIMIT(50%)
```

---

### 1.5 INSULATION RESISTANCE MONITORING

#### PSI Specification vs. Industry Standards

**PSI 80V/96V Battery Requirement:**
- Minimum insulation resistance: **≥20 MΩ** at 500VDC, 60 seconds
- Measured via internal BMS bridge method (electric bridge circuit)
- Tests positive and negative rail isolation separately

**Industry Automotive Standard (for reference):**
- Requirement: >500Ω/V of nominal voltage
- 80V system minimum: 40kΩ
- 96V system minimum: 48kΩ
- *PSI exceeds automotive by 400-500x factor for industrial safety margin*

#### Three-Level Insulation Boundaries

| Level | Resistance | BMS Action | User Notification | Safety Margin |
|-------|---|---|---|---|
| **GOOD** | >5 MΩ | Monitor only | Green status | 4× minimum safety margin |
| **MARGINAL** | 1-5 MΩ | Begin logging events | Yellow alert | Within acceptable range, trending down |
| **BAD-Level 1** | 500kΩ-1 MΩ | Alarm only, log | Yellow alert | Close to critical |
| **BAD-Level 2** | 200-500kΩ | Reduce charge current 50% | Orange warning | Imminent failure risk |
| **BAD-Level 3** | 100-200kΩ | Reduce current 75% | Red critical | System unstable |
| **BAD-Level 4** | <100kΩ | Open main relay, power off | Red emergency | Immediate shutdown required |

#### Loss of Isolation (LOI) Detection Implementation

**Two-Rail Monitoring (PSI iBMS approach):**
1. **Positive Rail Insulation**: Tests HV+ to chassis/ground
2. **Negative Rail Insulation**: Tests HV- to chassis/ground
3. **Both monitored simultaneously** during charge and discharge

**Detection Method:**
- BMS applies low-level test signal and measures leakage current
- Calculates insulation = 500VDC reference / leakage current
- Updates insulation value every 5-10 seconds during operation
- Checks after key-on, before engaging relays

**Preventive Maintenance Trigger:**
- If insulation drops >0.5 MΩ in 24 hours → Flag for inspection
- Rapid drop pattern (1 MΩ per week) → Schedule service within 2 weeks
- Any single point measurement <1 MΩ → Investigate immediately

---

### 1.6 STATE OF CHARGE (SOC)

#### Operating Window Definition

**PSI Range:** 10-100%

**Recommended Operating Windows:**
- **Maximum Recommended**: 95-100% (except when fully charging required)
- **Optimal Daily Window**: 20-90% (extends cycle life significantly)
- **Minimum Safe**: ≥10% (prevents over-discharge damage)

#### Three-Level SOC Boundaries

| Level | Range (%) | Interpretation | Action |
|-------|---|---|---|
| **GOOD** | 20-90 | Normal operating window for maximum longevity | Standard operation |
| **MARGINAL-High** | 90-100 | Fully charged or overcharged risk | Monitor charging completion, verify BMS stop |
| **MARGINAL-Low** | 10-20 | Approaching discharge cut-off | Warning: limited operating time remaining |
| **BAD-Low** | <10 | Over-discharge risk | Should not occur; investigate BMS discharge cutoff |
| **BAD-High** | >100 | Calculation error or overcharge | Critical BMS failure, investigate immediately |

**Calculation Method:**
- BMS typically uses coulomb counting (integrate current over time)
- Calibrated against open-circuit voltage (OCV) at top and bottom of charge
- Recalibrated when SOC = 0% and SOC = 100% threshold detected

---

### 1.7 STATE OF HEALTH (SOH)

#### Degradation Thresholds and End-of-Life

**Typical LiFePO4 Cycle Life:**
- PSI specification: 3,500 full cycles @ 25°C, 1C rate, 100% DOD → 80% SOH
- Actual degradation: 1-4% annually under normal use
- Critical End-of-Life threshold: 70-80% SOH per manufacturers

#### Three-Level SOH Boundaries

| Level | SOH (%) | Cycles to EOL* | Capacity Loss | Action |
|---|---|---|---|---|
| **GOOD** | >90 | >2000 cycles | <10% loss | Normal operation, no action needed |
| **MARGINAL** | 80-90 | 500-2000 cycles | 10-20% loss | Begin replacement planning, monitor closely |
| **BAD-Level 1** | 70-80 | 200-500 cycles | 20-30% loss | Schedule replacement soon, 50% power derating |
| **BAD-Level 2** | 60-70 | 50-200 cycles | 30-40% loss | Critical replacement window, emergency mode |
| **EOL** | <60 | <50 cycles | >40% loss | Replacement immediate, not operational |

*Estimates based on typical operation; actual varies with charge/discharge rates and temperature

#### SOH Calculation Methods

**Method 1 - Capacity Comparison (Most Reliable):**
```
SOH = (current_capacity / rated_capacity) × 100%
```
- Requires measuring capacity periodically (full charge/discharge cycle)
- Most accurate but time-consuming

**Method 2 - Internal Resistance Trend (Real-time):**
```
SOH = 100% × (1 - (current_DC-IR / initial_DC-IR))
```
- DC-IR = DC Internal Resistance measured via pulse discharge test
- Updates during operation
- Good for trending but less accurate than capacity method

**Method 3 - Coulomb Counting with OCV Calibration (BMS Standard):**
- Integrates current over time with periodic OCV recalibration
- Standard approach used by PSI iBMS
- Adapted by machine learning as aging progresses

#### Degradation Rate Monitoring

- Calculate SOH every 50 cycles
- Plot SOH trend line over time
- Flag if degradation rate >0.2% per cycle (abnormally fast)
- Normal: ~0.02% per cycle under standard operation

---

### 1.8 CURRENT LIMITS

#### PSI 80V Continuous Ratings
| Parameter | Current (A) | Duration |
|---|---|---|
| Max Continuous Charge | 200 | Unlimited |
| Max Continuous Discharge | 300 (80V304Ah) | Unlimited |
| Max Peak Discharge | 600 | ≤10 seconds |
| Max Peak Discharge | 400 | ≤60 seconds |
| Max Feedback Current | 400 | ≤10 seconds |

#### PSI 96V Continuous Ratings
| Parameter | Current (A) | Duration |
|---|---|---|
| Max Continuous Charge | 200 | Unlimited |
| Max Continuous Discharge | 230 | Unlimited |
| Max Peak Discharge | 460 | ≤10 seconds |
| Max Peak Discharge | 400 | ≤60 seconds |

#### Three-Level Current Boundaries

| Level | Discharge Current | Charge Current | Interpretation | Action |
|---|---|---|---|---|
| **GOOD** | <70% of max | <70% of max | Normal operation, safe margin | Allow operation |
| **MARGINAL** | 70-90% of max | 70-90% of max | High utilization but safe | Monitor for heat, temperature correlation |
| **BAD** | >90% of max | >90% of max | Peak operation, thermal risk | Limit to 90%, monitor temperature closely |

**Peak Current Duration Monitoring (Critical for Thermal Events):**
- Flag if peak currents (>80% max) sustained beyond rated duration
- Example: If 600A discharge (for ≤10s only) continues beyond 15 seconds → Alarm
- Causes excessive heating in connectors and internal resistance

#### Abnormal Charge Current Patterns

**DC Charging Over-Current Detection (PSI iBMS Levels):**
| Level | Threshold (A) | PSI Config | Action |
|---|---|---|---|
| **Level 1** | 210A | Alarm only | Log event |
| **Level 2** | 230A | Fault reported, power reduced | -50% charging current |
| **Level 3** | 250A | Critical fault | Power-off process |

---

## Part 2: Anomaly Detection Algorithm Implementation

### 2.1 Multi-Parameter Correlation Detection

**Rationale:** Single parameter violations can be transient or false alarms. Simultaneous violations across correlated parameters indicate genuine faults.

**Common Fault Signatures:**

| Fault Type | Voltage | Temperature | Current | Insulation | Action |
|---|---|---|---|---|---|
| **Internal Short** | Drop 0.1-0.3V/cell | Rise 2-5°C/min | Unplanned increase | Drop | Alert + Reduce I 50% |
| **Cell Imbalance** | Spread increases | Localized hot spot | Normal | Normal | Alert, balance |
| **Water Intrusion** | Normal | Normal | Normal | Drops rapidly | Alert, isolate |
| **Contact Resistance** | Slight increase | Localized high | Flows uneven | Normal | Alert, inspect |
| **Overcharging** | >3.65V/cell | Slight rise | Taper-controlled | Normal | Alert, reduce charge |
| **Thermal Runaway** | Volatile swings | Rise >5°C/min | Spikes | Drops | EMERGENCY SHUTDOWN |

### 2.2 Time-Series Decomposition for Anomaly Detection

This technique separates signal into trend, seasonal, and residual components:

```
Original Signal = Trend + Seasonal + Residual

Where:
- Trend: Long-term direction (degradation)
- Seasonal: Predictable patterns (charge/discharge cycles)
- Residual: Anomalies (faults)
```

**Implementation for Cell Voltage:**
1. Extract last 50 data points for each cell
2. Apply STL (Seasonal and Trend decomposition using Loess) algorithm
3. Calculate trend component for each cell
4. Compare adjacent cell trends using Manhattan Distance
5. Amplify small differences to catch early failures

**Benefits:**
- Filters noise from normal operation
- Detects cell failures weeks before absolute threshold violation
- Robust to SOC-dependent voltage variations

### 2.3 Outlier Detection Using Statistical Methods

**Z-Score Method (for cell voltage):**
```
Z = (cell_voltage - mean_voltage) / standard_deviation

Flags:
- Z > 2.0: Marginal (95% confidence deviation)
- Z > 3.0: Critical (99.7% confidence deviation)
```

**Local Outlier Factor (LOF Algorithm):**
- Compares cell to k-nearest neighbors (typically k=5)
- Calculates density-based outlier score
- More robust than Z-score for multi-dimensional data
- Example: Combines voltage + temperature + current

### 2.4 Rate-of-Change Monitoring

**Velocity Calculation:**
```
velocity = (current_value - value_N_seconds_ago) / N

Thresholds for battery voltage:
- Normal: <0.05V/minute
- Caution: 0.05-0.1V/minute  
- Alert: >0.1V/minute
```

**Acceleration Calculation:**
```
acceleration = (current_velocity - previous_velocity) / time_interval

Indicates:
- Zero: Steady degradation
- Positive: Degradation accelerating (failure imminent)
- Negative: Recovery (unlikely in batteries)
```

### 2.5 Cross-Parameter Weightings

**Significance Scoring for Fault Probability:**

| Parameter | Weight | Reliability | Implementation |
|---|---|---|---|
| Cell Voltage Spread | 25% | Very High | Distance from mean |
| Temperature Rise Rate | 20% | High | Derivative calculation |
| Insulation Resistance | 15% | Medium | Bridge method limited |
| SOH Trend | 15% | Medium-High | Requires historical data |
| Current vs. Thermal | 10% | High | Correlation check |
| Voltage Divergence | 10% | High | Outlier detection |
| SOC Consistency | 5% | Medium | Coulomb counting error |

**Composite Fault Score:**
```
fault_score = Σ(parameter_severity × weight)

0-20: Normal
20-40: Caution (marginal)
40-60: Alert (investigate)
60-80: Warning (reduce current)
80-100: Critical (emergency response)
```

---

## Part 3: GUI Implementation Recommendations

### 3.1 Real-Time Status Indicators

**Main Dashboard (Overview):**
- Large pack voltage display (GREEN/YELLOW/RED background)
- SOC gauge (0-100% arc)
- SOH status (>90% GREEN, 80-90% YELLOW, <80% RED)
- System temperature (current + max today)
- Insulation resistance (>5MΩ GREEN, 1-5 YELLOW, <1 RED)

**Cell Monitor Tab:**
- 24 or 32 individual cell voltage bars
- Color gradient (GREEN 3.2-3.55V, YELLOW 3.0-3.2 or 3.55-3.65V, RED outside)
- Voltage spread indicator (real-time max-min display)
- Outlier highlighting (cell exceeds Z-score threshold)

**Temperature Tab:**
- Heatmap of all temperature sensors
- Trend graph (last 24 hours)
- Rate-of-change indicator (°C/min current value)
- Alarm history log

**Insulation Tab:**
- Positive rail resistance gauge
- Negative rail resistance gauge
- Historical trend (last 7 days)
- Alert threshold lines

### 3.2 Alert Configuration

**Three-Level Alarm Strategy (PSI iBMS):**

| Threshold | Response | User Alert | Automatic Action |
|---|---|---|---|
| **Level 1** | Primary threshold exceeded | Yellow notification | Log event, increase monitoring |
| **Level 2** | Secondary threshold exceeded | Orange warning | Report to controller, reduce current 50% |
| **Level 3** | Final threshold exceeded | Red alert, audible alarm | Open relays, power-off sequence |

### 3.3 Data Logging & Export

**Minimum Logged Parameters (for diagnostics):**
- Timestamp
- All 24/32 individual cell voltages
- Pack voltage (HV+, HV-)
- All temperature sensors
- Current (magnitude + direction)
- SOC, SOH
- Insulation positive & negative
- BMS firmware version
- External controller status/faults

**Export Formats:**
- CSV (columns: timestamp, cell_1, cell_2, ..., pack_V, temp_1, current, SOC, SOH, insulation_pos, insulation_neg)
- JSON (for cloud upload/analysis)
- PDF report (monthly summary with graphs)

---

## Part 4: Maintenance Triggering Rules

### 4.1 Preventive Maintenance Scheduling

**Schedule Service When:**
- SOH drops below 85% (Plan replacement in next 2-3 months)
- Cell voltage spread exceeds 100mV consistently (Investigate balancing circuit)
- Temperature spread >8°C persists (Check thermal distribution)
- Insulation drops 50% in 48 hours (Inspect for moisture)
- SOH degradation accelerates >0.05% per cycle (Cell aging anomaly)

### 4.2 Emergency Shutdown Triggers

**Automatic Power-Off When:**
- Any cell voltage <2.5V or >4.0V
- Pack temperature >60°C AND temperature rise rate >3°C/min
- Insulation <100kΩ
- Loss of all voltage measurements (sensor failure)
- SOC >105% or <-5% (coulomb counting runaway)

---

## Part 5: Calibration & Commissioning

### 5.1 Initial Commissioning Checklist

1. **Verify cell count**: Compare electrical measurements to expected series configuration
2. **Baseline insulation**: Measure insulation before first use (should be >100MΩ for new pack)
3. **Calibrate voltage sensors**: Compare iBMS readings to multimeter on every cell
4. **Record initial SOH**: Perform full charge/discharge capacity test
5. **Temperature baseline**: Run thermal profile at 0%, 50%, 100% SOC states
6. **Current sensor verification**: Verify current readings against load bank

### 5.2 Parameter Threshold Customization

**For Your Specific Application:**
- Adjust temperature boundaries if system has active cooling
- Modify current % thresholds based on actual load profile
- Set SOH replacement threshold based on spare parts availability
- Calibrate insulation test interval based on operational environment

---

## Summary Table: Quick Reference

| Parameter | GOOD | MARGINAL | BAD | GUI Color |
|---|---|---|---|---|
| **Cell Voltage** | 3.2-3.55V | 3.0-3.2 / 3.55-3.65V | <3.0 / >3.65V | 🟢🟡🔴 |
| **Voltage Spread** | <30mV | 30-150mV | >150mV | 🟢🟡🔴 |
| **Pack Voltage (80V)** | 76.8-85.2V | 72-76.8 / 85.2-90V | <72 / >90V | 🟢🟡🔴 |
| **Pack Voltage (96V)** | 102.4-113.6V | 96-102.4 / 113.6-120V | <96 / >120V | 🟢🟡🔴 |
| **Temperature** | 15-40°C | 5-15 / 40-50°C | <5 / >50°C | 🟢🟡🔴 |
| **Temp Spread** | <5°C | 5-10°C | >10°C | 🟢🟡🔴 |
| **Temp Rise Rate** | <1°C/min | 1-2°C/min | >5°C/min | 🟢🟡🔴 |
| **Insulation** | >5MΩ | 1-5MΩ | <1MΩ | 🟢🟡🔴 |
| **SOC** | 20-90% | 10-20 / 90-100% | <10 / >100% | 🟢🟡🔴 |
| **SOH** | >90% | 80-90% | <80% | 🟢🟡🔴 |
| **Current (% max)** | <70% | 70-90% | >90% | 🟢🟡🔴 |

---

## References

- PSI PSITC23001 Li-Ion Technical Training (April 2024)
- IEEE 1188: Battery Management Systems
- IEC 61557: Electrical Safety Test Equipment
- SAE J2931: Electric Vehicle Power Transfer System
- Industry research on LiFePO4 balancing and anomaly detection algorithms

---

*Document Version: 1.0*  
*Last Updated: January 2026*  
*For: Industrial 80V-105V Lithium-Ion Battery Monitoring Application*
