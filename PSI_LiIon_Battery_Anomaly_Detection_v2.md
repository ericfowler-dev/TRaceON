# PSI Li-Ion Battery Anomaly Detection Reference

> **Purpose**: This document provides threshold values and boundary conditions for detecting anomalies and faults in PSI industrial lithium-ion battery systems. Use this reference for BMS data analysis, telemetry monitoring, and fault classification.
> 
> **Version**: 2.0  
> **Source**: PSI Li-Ion Technical Training (April 2024) and PSI Battery Anomaly Detection Thresholds

---

## Table of Contents

1. [Battery Models and Specifications](#battery-models-and-specifications)
2. [Severity Level Definitions](#severity-level-definitions)
3. [Temperature Thresholds](#temperature-thresholds)
4. [Voltage Thresholds](#voltage-thresholds)
5. [Current Limits](#current-limits)
6. [State of Charge (SOC)](#state-of-charge-soc-thresholds)
7. [State of Health (SOH)](#state-of-health-soh-thresholds)
8. [Insulation/Isolation Resistance](#insulationisolation-resistance)
9. [Rate-of-Change Detection](#rate-of-change-detection)
10. [Multi-Condition Compound Faults](#multi-condition-compound-faults)
11. [Hysteresis Guidelines](#hysteresis-guidelines)
12. [Telemetry Field Mapping](#telemetry-field-mapping)
13. [Quick Reference Rules](#quick-reference-anomaly-detection-rules)
14. [Data Validation Checks](#data-validation-checks)

---

## Battery Models and Specifications

All models use **Lithium Iron Phosphate (LiFePO₄)** chemistry.

| Model | Nominal Voltage | Capacity | Configuration | Energy | Cells |
|-------|-----------------|----------|---------------|--------|-------|
| 80V230Ah | 80V | 230 Ah | 1P24S | ~17.7 kWh | 24 series |
| 80V304Ah | 80V | 304 Ah | 1P24S | ~23.3 kWh | 24 series |
| 80V460Ah | 80V | 460 Ah | 2P24S | ~35.3 kWh | 48 (2 parallel × 24 series) |
| 96V230Ah | 96V | 230 Ah | 1P32S | ~23.6 kWh | 32 series |

---

## Severity Level Definitions

| Level | Name | Description | Action |
|-------|------|-------------|--------|
| **1** | Informational | Minor deviation, approaching limit, within safe margins | Log event, monitor closely |
| **2** | Warning | Significant deviation requiring intervention | Reduce operation, alert operator, investigate |
| **3** | Critical | Severe safety risk or potential damage | Immediate shutdown, disconnect battery, service required |

**PSI Fault Response Hierarchy**: These levels align with PSI's standard fault response—Level 1 alarm, Level 2 power reduction, Level 3 shutdown/relay disconnect.

---

## Temperature Thresholds

### Normal Operating Ranges

| Operation | Min Temp | Max Temp | Notes |
|-----------|----------|----------|-------|
| **Charging** | 0°C (32°F) | 55°C (131°F) | Prevents lithium plating (cold) and cell stress (hot) |
| **Discharging** | -30°C (-22°F) | 60°C (140°F) | Wider range, but performance impacted at extremes |

> **Sensor Tolerance**: BMS may ignore deviations of ±2°C to prevent false alarms. Small temperature overshoots within 2°C of limit should be treated as Level 1 unless persistent.

### Charging Temperature Anomalies

| Level | Low Temp Range | High Temp Range | Condition | BMS Response |
|-------|----------------|-----------------|-----------|--------------|
| **1** | -1°C to 0°C | 55°C to 57°C | Within ±2°C probe accuracy margin | Monitor, may delay charging |
| **2** | -5°C to -1°C | 57°C to 60°C | Risk of lithium plating (cold) or accelerated degradation (hot) | Reduce current, pause charging, activate heater/cooling |
| **3** | < -5°C | > 60°C | **STOP CHARGING** - Safety risk, thermal runaway possible | Inhibit charging, initiate shutdown |

**Safety Notes**:
- Charging below 0°C causes dangerous lithium metal plating on anode
- Cell temperatures ≥60°C can cause gas generation, cell venting, thermal runaway

### Discharging Temperature Anomalies

| Level | Low Temp Range | High Temp Range | Condition | BMS Response |
|-------|----------------|-----------------|-----------|--------------|
| **1** | -32°C to -30°C | 60°C to 62°C | Slightly outside limits, reduced performance | Alert, limit heavy loads |
| **2** | -35°C to -32°C | 62°C to 65°C | Significant performance reduction, approaching danger | Limit discharge current, alert operator |
| **3** | < -35°C | > 65°C | **CUT OFF DISCHARGE** - Risk of venting/thermal runaway | Open main contactor, remove from service |

**Cold Weather Performance Impact**:
- Capacity drops ~20% at 0°C
- Capacity drops ~40%+ at -20°C
- At extreme cold, cell impedance prevents power delivery and risk of lithium plating on subsequent charge is severe

---

## Voltage Thresholds

### Cell Voltage Reference Values

| Parameter | LiFePO₄ Value | Notes |
|-----------|---------------|-------|
| **Minimum (empty)** | 2.5V | 0% SOC, discharge cutoff |
| **Maximum (full)** | 3.55V | 100% SOC, charge termination target |
| **Absolute Max (safety limit)** | 3.65V | Do not exceed - electrolyte breakdown risk |
| **Critical Low (no-load)** | < 2.3V | Irreversible damage, copper plating |
| **Critical Low (under-load)** | < 2.0V | Severe damage, cell likely failed |

### Pack Voltage Ranges

| Pack Type | Cells in Series | Min Voltage (2.5V/cell) | Max Voltage (3.55V/cell) |
|-----------|-----------------|-------------------------|--------------------------|
| 80V (24S) | 24 | 60.0V | 85.2V |
| 96V (32S) | 32 | 80.0V | 113.6V |

### Over-Voltage (Overcharge) Anomalies

| Level | Cell Voltage | Pack Voltage (80V/24S) | Pack Voltage (96V/32S) | Condition |
|-------|--------------|------------------------|------------------------|-----------|
| **1** | 3.50V - 3.55V | 84.0V - 85.2V | 112.0V - 113.6V | Approaching full charge, possible minor imbalance |
| **2** | > 3.60V | > 86.4V | > 115.2V | Charger/BMS failed to terminate, accelerated degradation |
| **3** | ≥ 3.65V | ≥ 87.6V | ≥ 116.8V | **CRITICAL** - Electrolyte breakdown, thermal runaway risk |

**Level 1**: BMS typically starts bypass balancing. Log if any cell consistently hits upper limit early (indicates imbalance).
**Level 2**: Stop charging immediately, flag warning. Prolonged exposure reduces cycle life, can cause cell swelling.
**Level 3**: Immediate charge cutoff and system shutdown. Indicates charger failure or BMS malfunction.

### Under-Voltage (Over-Discharge) Anomalies

| Level | Cell Voltage | Load Condition | Pack Voltage (80V/24S) | Condition |
|-------|--------------|----------------|------------------------|-----------|
| **1** | 2.7V - 2.8V | Any | ~65V - 67V | Battery nearly empty (low single-digit SOC), recharge soon |
| **2** | ~2.5V | Under load | ~60V | At discharge cutoff (0% SOC), terminate discharge |
| **3** | < 2.5V | No load | < 60V | Severe over-discharge, irreversible capacity loss beginning |
| **3** | < 2.3V | No load | < 55V | **CRITICAL** - Permanent damage, copper plating, cell likely failed |
| **3** | < 2.0V | Any condition | < 48V | **CRITICAL** - Cell failure, open main relay immediately |

**Key Distinction**: 
- Under-load voltage sag to ~2.5V triggers Level 2 (normal cutoff behavior)
- No-load voltage < 2.5V indicates actual over-discharge (Level 3)
- No-load voltage < 2.3V indicates severe damage or failed cell

**Level 3 Actions**: Open main relay, service required, pack may need cell replacement.

### Cell Voltage Imbalance (Delta)

The difference between highest and lowest cell voltages indicates pack health. Even if all cells are within safe absolute voltages, large imbalance indicates weak cells and risk of cell reversal on deep discharge.

| Level | Cell Delta | Condition | Action |
|-------|------------|-----------|--------|
| **1** | > 50mV (0.05V) | Minor imbalance, slightly elevated | Monitor trend, BMS balancing should correct |
| **2** | > 100mV (0.10V) | Significant imbalance, weak cell suspected | Flag warning, limit depth of discharge, schedule maintenance |
| **3** | > 200mV (0.20V) | **CRITICAL** - Bad cell or connection, risk of reversal | Restrict operation, lower discharge current, immediate service required |

**Detection Formula**: `cell_delta = max(cell_voltages) - min(cell_voltages)`

**Example Level 3 Scenario**: At 100% charge, one cell at 3.65V while another at 3.45V, OR at discharge one cell collapsed to 2.3V while others are 2.5V+.

---

## Current Limits

### Maximum Current Specifications by Model

| Model | Continuous Discharge | Continuous Charge | 10s Peak Discharge | 60s Peak Discharge | 10s Regen Peak |
|-------|---------------------|-------------------|-------------------|-------------------|----------------|
| 80V230Ah | 230A | 200A | 460A | 400A | 400A |
| 80V304Ah | 300A | 200A | 600A | 400A | 400A |
| 80V460Ah | 400A | 200A | 600A | 600A | 450A |
| 96V230Ah | 230A | 200A | 460A | 400A | 400A |

### Discharge Over-Current Anomalies

| Level | Condition | Duration Context | Example (80V304Ah) |
|-------|-----------|------------------|-------------------|
| **1** | 100-110% of continuous rating | Brief (within 10s peak allowance) | 300A - 350A for a few seconds |
| **2** | Exceeds continuous for extended time OR approaches 10s peak limit | Beyond normal peak duration | >300A sustained >60s, OR near 600A for >10s |
| **3** | Exceeds 10s peak OR 60s rating by large margin/time | Any | >600A any duration, OR >400A beyond 60s |

**Level 1**: BMS allows such peaks by design. Log as event (heavy load, aggressive acceleration).
**Level 2**: BMS should limit power/current, log warning. Indicates load too high or motor controller fault.
**Level 3**: Immediate shutdown, open main relay or blow fast-acting fuse. Likely short-circuit or stalled motor.

### Charge/Regen Over-Current Anomalies

| Level | Condition | Duration Context | Example |
|-------|-----------|------------------|---------|
| **1** | Nearing 200A continuous OR within 10s regen spec | Brief surge | 250A - 300A regen for a few seconds |
| **2** | Exceeds 200A continuous significantly OR near max feedback for full duration | Sustained | 300A - 400A regen sustained ~10s, OR charger >200A |
| **3** | Exceeds 10s feedback max | Any | >400A (most models), >450A (80V460Ah) |

**Level 2**: BMS should throttle, possibly divert regen to resistors. Charger >200A indicates malfunction.
**Level 3**: Stop charging immediately, disconnect. Indicates faulty charger or inverter, control system failure.

---

## State of Charge (SOC) Thresholds

**Operating Range**: PSI specifies 10% - 100% SOC operating range.

| Level | SOC Value | Condition | Action |
|-------|-----------|-----------|--------|
| **1** | < 20% | Low battery approaching minimum | Warn operator, plan recharging |
| **2** | ≤ 10% | Critically low, at recommended minimum | Restrict power output, stop operation, recharge immediately |
| **3** | 0% | Undervoltage cutoff triggered | BMS cuts off discharge (correlates with voltage Level 2/3) |

**Important**: SOC Level 3 is effectively reached via voltage protection. When SOC hits 0%, cells are at ~2.5V, triggering undervoltage shutdown. The BMS prevents going below 0% SOC under normal operation.

**Data Anomalies (Level 3 Data Fault)**:
- SOC reading outside 0-100% range
- SOC suddenly jumps (indicates measurement or calibration fault)
- SOC reads negative or >100%

---

## State of Health (SOH) Thresholds

SOH indicates usable capacity relative to new (100% when new, declining over life).

| Level | SOH Value | Condition | Action |
|-------|-----------|-----------|--------|
| **1** | ≤ 90% | Moderate degradation (~10% capacity loss) | Log, track more closely, normal aging |
| **2** | ≤ 80% | **End-of-Life (EOL)** threshold reached | Schedule replacement/refurbishment, significant runtime reduction |
| **3** | < 70% | Severe degradation, battery compromised | **Remove from service**, immediate replacement required |

**EOL Definition**: PSI defines End-of-Life as reaching 80% of original capacity.

**Additional Level 3 Triggers**:
- Sudden/rapid SOH decline (indicates cell failure or abnormal wear)
- Internal resistance growth to unsafe levels
- Abrupt capacity loss even if SOH percentage not yet <70%

---

## Insulation/Isolation Resistance

High-voltage battery packs must maintain electrical isolation from chassis/frame for safety.

### Specification
- **Manufacturing Requirement**: ≥20 MΩ at 500V DC test voltage for 60 seconds
- **Detection Method**: BMS uses electrical resistive bridge to continuously monitor isolation

### Operational Thresholds

> **Note**: The resistance values below are **approximate/typical thresholds**. Exact trigger points may vary by system configuration. These are illustrative values based on PSI's 3-level fault response hierarchy.

| Level | Resistance Range (Approximate) | Condition | Action |
|-------|-------------------------------|-----------|--------|
| **1** | ~1-2 MΩ (below expected norms) | Slight reduction, possible moisture ingress or minor ground leakage | Log alarm, inspect for breaches or wet connectors |
| **2** | ~500 kΩ (0.5 MΩ) | Significant loss, leakage current becoming hazardous | **Reduce power 50%**, service ASAP |
| **3** | ≤ ~200 kΩ | Severe failure, imminent shock or short-circuit hazard | **OPEN MAIN RELAY**, immediate shutdown, do not use until repaired |

**Leakage Current Context** (for 80-100V systems):
- At 500 kΩ: ~0.2 mA leakage (considered high)
- At 200 kΩ: ~0.5 mA leakage (unacceptable)

**Common Causes**: Water flooding battery case, high-voltage cable insulation failure touching chassis, moisture ingress, contamination.

---

## Rate-of-Change Detection

Sudden parameter changes often indicate sensor faults, connection issues, or acute failures. Monitor these rates in addition to absolute thresholds.

### Rate-of-Change Thresholds

| Parameter | Normal Rate | Warning Rate (Level 2) | Critical Rate (Level 3) | Notes |
|-----------|-------------|------------------------|------------------------|-------|
| **Cell Voltage** | < 10mV/s | > 50mV/s | > 100mV/s | Sudden drops may indicate connection fault or cell failure |
| **Cell Delta** | < 5mV/min | > 20mV/min | > 50mV/min | Rapid divergence indicates acute cell problem |
| **Temperature** | < 1°C/min | > 3°C/min | > 5°C/min | Rapid rise may indicate internal short or thermal event |
| **SOC** | < 1%/min (under load) | > 5%/min | > 10%/min | Jumps indicate sensor fault or calibration error |
| **SOH** | < 0.1%/cycle | > 1%/week | > 5% sudden drop | Rapid decline indicates cell failure |
| **Insulation** | Stable | > 20% drop in 1 hour | > 50% sudden drop | Sudden drop indicates acute insulation breach |
| **Pack Current** | Load-dependent | N/A | Sudden spike >2x expected | May indicate short circuit |

### Implementation Notes

```
# Rate of change calculation
rate = (current_value - previous_value) / time_delta

# For voltage rate detection
voltage_rate = (cell_voltage_now - cell_voltage_1s_ago) / 1.0  # V/s

# For temperature rate detection  
temp_rate = (temp_now - temp_1min_ago) / 60.0  # °C/s, then convert to °C/min
```

---

## Multi-Condition Compound Faults

Some fault conditions are more severe when combined. The following combinations should escalate severity or trigger immediate protective action.

### Compound Fault Matrix

| Condition A | Condition B | Combined Severity | Rationale |
|-------------|-------------|-------------------|-----------|
| High Temperature (>55°C) | High Current (>80% rating) | **Escalate +1 Level** | Heat generation compounds; thermal runaway risk increases |
| High Temperature (>55°C) | High SOC (>90%) | **Escalate +1 Level** | Fully charged cells more vulnerable to thermal stress |
| Low Temperature (<0°C) | Charging Active | **Level 3 Immediate** | Lithium plating risk regardless of charge rate |
| Low SOC (<15%) | High Discharge Current | **Escalate +1 Level** | Risk of cell reversal on weak cells |
| High Cell Delta (>100mV) | High Current (any direction) | **Escalate +1 Level** | Weak cell may be pushed into over-voltage or under-voltage |
| High Cell Delta (>100mV) | Low SOC (<20%) | **Level 3** | Weak cell at high risk of reversal |
| Low Insulation (<1MΩ) | High Humidity/Moisture Detected | **Escalate +1 Level** | Active water ingress likely |
| Any Level 2 Fault | Second Level 2 Fault (different parameter) | **Escalate to Level 3** | Multiple degraded conditions indicate systemic issue |

### Compound Fault Detection Logic

```
# Example: Temperature + Current compound check
IF (temp > 55°C) AND (current > 0.8 * continuous_rating):
    effective_level = base_level + 1
    
# Example: Low temp charging (always critical)
IF (temp < 0°C) AND (charge_current > 0):
    trigger Level 3 immediately
    
# Example: Multiple Level 2 faults
IF (count of active Level 2 faults >= 2):
    escalate to Level 3
```

---

## Hysteresis Guidelines

To prevent alarm chatter (rapid on/off cycling), implement hysteresis on all thresholds.

### Recommended Hysteresis Values

| Parameter | Threshold Type | Set Point Example | Clear Point | Hysteresis |
|-----------|---------------|-------------------|-------------|------------|
| **Cell Voltage (high)** | Level 2 Over-voltage | > 3.60V | < 3.55V | 50mV |
| **Cell Voltage (low)** | Level 2 Under-voltage | < 2.50V | > 2.55V | 50mV |
| **Temperature (high)** | Level 2 Charging | > 57°C | < 54°C | 3°C |
| **Temperature (low)** | Level 2 Charging | < -2°C | > 1°C | 3°C |
| **Cell Delta** | Level 2 Imbalance | > 100mV | < 80mV | 20mV |
| **SOC** | Level 2 Low | < 10% | > 15% | 5% |
| **SOH** | Level 2 EOL | < 80% | N/A (no clear) | N/A (latching) |
| **Insulation** | Level 2 | < 500kΩ | > 600kΩ | ~100kΩ (20%) |
| **Current** | Level 2 Over-current | > continuous rating | < 90% continuous | 10% |

### Hysteresis Implementation

```
# Generic hysteresis logic
IF (not alarm_active) AND (value > set_threshold):
    alarm_active = True
    log_event("Alarm SET", parameter, value)
    
IF (alarm_active) AND (value < clear_threshold):
    alarm_active = False
    log_event("Alarm CLEAR", parameter, value)

# For latching alarms (e.g., SOH EOL), require manual reset
IF (soh < 80%):
    eol_alarm = True  # Does not auto-clear
```

### Time Delay Recommendations

| Fault Type | Activation Delay | Notes |
|------------|------------------|-------|
| Level 1 (Informational) | 5-10 seconds | Filter transient spikes |
| Level 2 (Warning) | 2-5 seconds | Quick response but avoid nuisance trips |
| Level 3 (Critical) | 0-1 second | Immediate for safety-critical faults |
| Over-current (within peak spec) | Per spec duration (10s, 60s) | BMS tracks duration against limits |
| Temperature | 30-60 seconds | Thermal mass provides natural filtering |

---

## Telemetry Field Mapping

Map anomaly detection thresholds to common BMS telemetry field names. Adjust field names to match your specific BMS data format.

### Common Telemetry Fields

| Parameter | Typical Field Names | Units | Sample Rate |
|-----------|---------------------|-------|-------------|
| Pack Voltage | `pack_voltage`, `total_voltage`, `bus_voltage` | V | 1 Hz+ |
| Cell Voltages | `cell_voltage_1` ... `cell_voltage_N`, `cell_voltages[]` | V | 1 Hz+ |
| Cell Delta | `cell_delta`, `voltage_delta`, `max_min_diff` | mV or V | 1 Hz (or calculated) |
| Pack Current | `pack_current`, `battery_current`, `load_current` | A | 10 Hz+ |
| Cell Temperatures | `cell_temp_1` ... `cell_temp_N`, `temperatures[]` | °C | 0.5-1 Hz |
| Max Cell Temp | `max_cell_temp`, `temp_max` | °C | 1 Hz |
| Min Cell Temp | `min_cell_temp`, `temp_min` | °C | 1 Hz |
| SOC | `soc`, `state_of_charge`, `soc_percent` | % | 1 Hz |
| SOH | `soh`, `state_of_health`, `soh_percent` | % | On request / daily |
| Insulation Resistance | `isolation_resistance`, `insulation_r`, `iso_resistance` | kΩ or MΩ | 0.1 Hz |
| Charge State | `charge_state`, `charging`, `is_charging` | Boolean/Enum | 1 Hz |
| Discharge State | `discharge_state`, `discharging`, `is_discharging` | Boolean/Enum | 1 Hz |
| BMS Fault Codes | `fault_code`, `alarm_status`, `error_flags` | Bitfield/Enum | On event |
| Contactor Status | `main_contactor`, `relay_status` | Boolean | 1 Hz |

### Calculated/Derived Fields

| Derived Parameter | Calculation | Purpose |
|-------------------|-------------|---------|
| `cell_delta` | `max(cell_voltages) - min(cell_voltages)` | Imbalance detection |
| `avg_cell_voltage` | `sum(cell_voltages) / num_cells` | Reference for anomaly detection |
| `voltage_rate` | `(voltage_now - voltage_prev) / dt` | Rate-of-change detection |
| `temp_rate` | `(temp_now - temp_prev) / dt` | Thermal event detection |
| `pack_power` | `pack_voltage * pack_current` | Power limit verification |

---

## Quick Reference: Anomaly Detection Rules

### Temperature Rules
```
# Charging temperature checks
IF charging AND temp < 0°C THEN Level 2 (at minimum, escalate if < -5°C)
IF charging AND temp < -5°C THEN Level 3 → STOP CHARGING
IF charging AND temp > 55°C THEN Level 1
IF charging AND temp > 57°C THEN Level 2
IF charging AND temp > 60°C THEN Level 3 → STOP CHARGING

# Discharging temperature checks
IF discharging AND temp < -30°C THEN Level 1
IF discharging AND temp < -32°C THEN Level 2
IF discharging AND temp < -35°C THEN Level 3 → CUT OFF DISCHARGE
IF discharging AND temp > 60°C THEN Level 1
IF discharging AND temp > 62°C THEN Level 2
IF discharging AND temp > 65°C THEN Level 3 → CUT OFF DISCHARGE

# Compound: Low temp + any charging = critical
IF temp < 0°C AND charge_current > 0 THEN Level 3 → IMMEDIATE STOP
```

### Voltage Rules
```
# Over-voltage (per cell)
IF cell_voltage > 3.50V THEN Level 1 (approaching limit)
IF cell_voltage > 3.60V THEN Level 2 → STOP CHARGING
IF cell_voltage >= 3.65V THEN Level 3 → CRITICAL SHUTDOWN

# Under-voltage (per cell)
IF cell_voltage < 2.8V THEN Level 1 (low, recharge soon)
IF cell_voltage <= 2.5V AND under_load THEN Level 2 → TERMINATE DISCHARGE
IF cell_voltage < 2.5V AND no_load THEN Level 3 (severe over-discharge)
IF cell_voltage < 2.3V THEN Level 3 → CRITICAL, OPEN RELAY
IF cell_voltage < 2.0V THEN Level 3 → CELL FAILURE

# Cell imbalance
cell_delta = max(cell_voltages) - min(cell_voltages)
IF cell_delta > 50mV THEN Level 1
IF cell_delta > 100mV THEN Level 2
IF cell_delta > 200mV THEN Level 3

# Compound: High delta + low SOC = critical
IF cell_delta > 100mV AND soc < 20% THEN Level 3
```

### Current Rules (Model-Specific Example: 80V304Ah)
```
# Discharge over-current
continuous_limit = 300A  # Model-specific
peak_10s_limit = 600A    # Model-specific
peak_60s_limit = 400A    # Model-specific

IF discharge_current > continuous_limit AND duration < 10s THEN Level 1
IF discharge_current > continuous_limit AND duration > 60s THEN Level 2
IF discharge_current > peak_60s_limit AND duration > 60s THEN Level 3
IF discharge_current > peak_10s_limit THEN Level 3 → IMMEDIATE SHUTDOWN

# Charge/regen over-current
charge_continuous = 200A
regen_10s_peak = 400A  # Model-specific (450A for 80V460Ah)

IF charge_current > charge_continuous THEN Level 2
IF charge_current > regen_10s_peak THEN Level 3 → STOP CHARGING
```

### SOC/SOH Rules
```
# SOC thresholds
IF soc < 20% THEN Level 1 (low battery warning)
IF soc <= 10% THEN Level 2 (critically low, restrict power)
IF soc <= 0% THEN Level 3 (via undervoltage protection)

# SOH thresholds
IF soh <= 90% THEN Level 1 (moderate aging)
IF soh <= 80% THEN Level 2 (EOL, schedule replacement)
IF soh < 70% THEN Level 3 (remove from service)

# SOH rate of change
IF soh_drop > 5% sudden THEN Level 3 (cell failure suspected)
```

### Insulation Rules (Approximate Values)
```
# Note: These are typical thresholds; exact values may vary
IF insulation_resistance < 2MΩ THEN Level 1 → ALARM, INSPECT
IF insulation_resistance < 500kΩ THEN Level 2 → REDUCE POWER 50%
IF insulation_resistance <= 200kΩ THEN Level 3 → OPEN RELAY, SHUTDOWN
```

### Rate-of-Change Rules
```
# Voltage rate
IF abs(cell_voltage_rate) > 100mV/s THEN Level 3 (connection fault or cell failure)
IF abs(cell_voltage_rate) > 50mV/s THEN Level 2

# Temperature rate
IF temp_rate > 5°C/min THEN Level 3 (thermal event)
IF temp_rate > 3°C/min THEN Level 2

# SOC jump detection
IF abs(soc_change) > 10% in < 1min THEN Level 3 (sensor fault)
IF abs(soc_change) > 5% in < 1min THEN Level 2
```

---

## Fault Response Summary

| Fault Type | Level 1 | Level 2 | Level 3 |
|------------|---------|---------|---------|
| **Temperature** | Monitor, log | Reduce current, activate thermal management | **Shutdown** |
| **Over-Voltage** | Log, monitor balancing | Stop charging, flag warning | **Shutdown, disconnect** |
| **Under-Voltage** | Log, recommend recharge | Terminate discharge, alert | **Open relay, service required** |
| **Cell Imbalance** | Monitor balancing trend | Limit DOD, flag maintenance | **Restrict operation, immediate service** |
| **Over-Current** | Log event | Limit power/current | **Shutdown, open relay** |
| **SOC** | Low battery warning | Restrict power, stop operation | **Undervoltage shutdown** |
| **SOH** | Track degradation | Schedule replacement | **Remove from service** |
| **Insulation** | Log alarm, inspect | **Reduce power 50%** | **Open main relay** |
| **Rate-of-Change** | Monitor trend | Investigate, reduce load | **Shutdown, diagnose** |
| **Compound Fault** | N/A | Escalate per matrix | **Immediate protective action** |

---

## Data Validation Checks

Flag these conditions as potential sensor/data faults before applying anomaly thresholds:

| Parameter | Invalid Condition | Action |
|-----------|-------------------|--------|
| SOC | Outside 0-100% range | Flag as Level 3 data fault |
| SOC | Sudden jump >10% without charge/discharge event | Flag as sensor/calibration fault |
| Cell Voltage | Negative value | Discard reading, flag sensor fault |
| Cell Voltage | > 4.0V | Flag as sensor fault (impossible for LiFePO₄) |
| Cell Voltage | Sudden jump > 0.5V | Flag as connection or sensor fault |
| Temperature | Outside -50°C to +100°C | Discard reading, flag sensor fault |
| Temperature | Sudden jump > 20°C | Flag as sensor fault |
| Current | Sign changes without load state change | Investigate sensor or contactor |
| Current | Impossible spike (>10x rating) | Discard, flag sensor fault |
| Insulation | Negative resistance | Discard reading, flag sensor fault |
| Insulation | Sudden change > 50% | Verify before acting (may be real fault) |
| Cell Count | Fewer cells reporting than expected | Flag as communication/sensor fault |

### Data Quality Scoring

```
# Simple data quality check
data_valid = True

IF soc < 0 OR soc > 100: data_valid = False
IF any(cell_voltage < 0 OR cell_voltage > 4.0): data_valid = False
IF any(temp < -50 OR temp > 100): data_valid = False
IF num_cells_reporting != expected_cell_count: data_valid = False

IF NOT data_valid:
    log_warning("Data quality issue detected")
    # Consider using last known good values or flagging for review
```

---

## Appendix: Model-Specific Threshold Quick Reference

### 80V230Ah
| Parameter | Level 1 | Level 2 | Level 3 |
|-----------|---------|---------|---------|
| Discharge Current | >230A brief | >230A sustained / >400A >60s | >460A |
| Charge Current | >200A brief | >200A sustained | >400A |
| Pack Voltage High | >84V | >86.4V | ≥87.6V |
| Pack Voltage Low | <67V | ≤60V | <55V |

### 80V304Ah
| Parameter | Level 1 | Level 2 | Level 3 |
|-----------|---------|---------|---------|
| Discharge Current | >300A brief | >300A sustained / >400A >60s | >600A |
| Charge Current | >200A brief | >200A sustained | >400A |
| Pack Voltage High | >84V | >86.4V | ≥87.6V |
| Pack Voltage Low | <67V | ≤60V | <55V |

### 80V460Ah
| Parameter | Level 1 | Level 2 | Level 3 |
|-----------|---------|---------|---------|
| Discharge Current | >400A brief | >400A sustained / >600A >60s | >600A >10s |
| Charge Current | >200A brief | >200A sustained | >450A |
| Pack Voltage High | >84V | >86.4V | ≥87.6V |
| Pack Voltage Low | <67V | ≤60V | <55V |

### 96V230Ah
| Parameter | Level 1 | Level 2 | Level 3 |
|-----------|---------|---------|---------|
| Discharge Current | >230A brief | >230A sustained / >400A >60s | >460A |
| Charge Current | >200A brief | >200A sustained | >400A |
| Pack Voltage High | >112V | >115.2V | ≥116.8V |
| Pack Voltage Low | <90V | ≤80V | <74V |

---

*Document Version: 2.0*  
*Last Updated: January 2026*  
*Source: PSI Li-Ion Technical Training (April 2024) and PSI Battery Anomaly Detection Thresholds*
