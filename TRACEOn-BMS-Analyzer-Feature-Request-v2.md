# TRACEOn BMS Analyzer — Feature Request: Enhanced Visualization

**Document Version:** 1.0  
**Date:** August 24, 2026  
**Target Release:** v2.0  
**Author:** PSI Customer Care Engineering

---

## Executive Summary

This document outlines visualization enhancements for the TRACEOn BMS Analyzer to improve diagnostic capability, particularly for investigating wake/sleep issues, relay behavior, and multi-parameter correlation. The core request is for **dynamic, user-configurable charts** that allow engineers to visualize any combination of logged parameters.

---

## 1. Key Switch State Visualization

### Current State
- SW1 and SW2 displayed as raw values: `1` or `0`
- Not immediately clear what state the switch is in
- Difficult to correlate with other events visually

### Requested Enhancement

#### 1.1 Human-Readable Labels

| Raw Value | Display Text | Color |
|-----------|--------------|-------|
| SW1 = 1 | **KEY ON** | Green |
| SW1 = 0 | **KEY OFF** | Gray |
| SW2 = 1 | **START ENGAGED** | Amber |
| SW2 = 0 | **START OFF** | Gray |

#### 1.2 State Timeline Chart (New)

Add a **Key Switch State** chart to the Overview page showing state transitions over time:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Key Switch State                                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ SW1 (Key)  ──────┐     ┌─────────────────────────────────────────────   │
│ ON               │     │                                                │
│ OFF    ──────────┴─────┘                                                │
│                   ↑                                                     │
│              Sleep Entry                                                │
│                                                                         │
│ SW2 (Start)                    ┌──┐      ┌──┐                          │
│ ENGAGED                        │  │      │  │                          │
│ OFF      ──────────────────────┴──┴──────┴──┴───────────────────────   │
│                                                                         │
│         08/18 15:35      08/19 07:06    07:15                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 1.3 Event Markers

Overlay key switch transitions on other charts (voltage, current, SOC) as vertical markers:
- **Green dashed line**: KEY ON
- **Red dashed line**: KEY OFF
- **Amber dashed line**: START ENGAGED

---

## 2. Additional Overview Charts

### Current State
- Cell Voltage Range (Min/Max)
- Temperature Range - Thermal Monitor

### Requested Additional Charts

#### 2.1 System State Timeline

Visual representation of BMS operating modes:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ System State                                                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ████ Discharging  ████ Charging  ░░░░ Sleep  ▓▓▓▓ Standby              │
│                                                                         │
│ ████████████████│████████████████│░░░░░░░░░░░░░░░│██████████████████   │
│                 ↑                ↑               ↑                      │
│            Charger Conn    Full Charge      Debug Wake                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 2.2 Relay State Monitor

Show all relay states over time:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Relay States                                                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ R0 (Main+)    ───┐          ┌────────────────────────────────────────   │
│ R1 (Main-)    ───┤          ├────────────────────────────────────────   │
│ R2 (Precharge)───┤    ┌─────┤                                           │
│ R3            ───┴────┴─────┴────────────────────────────────────────   │
│ R4            ─────────────────────┬─────────────────────────────────   │
│ R5 (Charger)  ────────────────────┬┴─────────────────────────────────   │
│                                                                         │
│               ■ Closed  ─ Open                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 2.3 Wake Signal & Power Supply

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Wake Source & Supply Voltage                                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Wake:   KL15 OBC ──────────────────┤ GAP │──── KL15 ──────────────────  │
│                                                                         │
│ 14V ─                    ┌─────────┐       ┌────────────────────────   │
│ 12V ─ ───────────────────┘         │       │                            │
│ 10V ─                              └───────┘                            │
│                                      ↑                                  │
│                              12V Aux during sleep?                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 2.4 Insulation Resistance

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Insulation Monitoring                                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ 65MΩ+ ─ ════════════════════════════════════════════════════════════   │
│                                                                         │
│ 1MΩ  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ Warning Threshold ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│                                                                         │
│ 500kΩ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ Critical Threshold ─ ─ ─ ─ ─ ─ ─ ─   │
│                                                                         │
│         ── System  ── Positive  ── Negative                             │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 2.5 Current & Power Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Current Flow                                                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ +100A ─           ┌───┐                                                 │
│    0A ─ ──────────┤   ├─────────────────────────────────────────────   │
│ -100A ─   ┌───────┘   └──┐         ┌────┐                              │
│ -200A ─ ──┘              └─────────┘    └───                            │
│                                                                         │
│         ▲ Charging    ▼ Discharging                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Dynamic/Configurable Charts (Primary Feature Request)

### Concept

Allow users to create custom charts by selecting any combination of parameters from the available data streams.

### 3.1 Parameter Selection UI

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Custom Chart Builder                                              [+ Add]│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Chart Title: [Wake Analysis - 08/18 Event________________]              │
│                                                                         │
│ ┌─ Y-Axis Left ─────────────┐  ┌─ Y-Axis Right ────────────┐          │
│ │ [×] Pack Voltage (V)      │  │ [×] SW1 (Key State)       │          │
│ │ [ ] Current (A)           │  │ [ ] SW2 (Start State)     │          │
│ │ [ ] Cell Max (mV)         │  │ [×] Wake Signal           │          │
│ │ [ ] Cell Min (mV)         │  │ [ ] System State          │          │
│ └───────────────────────────┘  └────────────────────────────┘          │
│                                                                         │
│ ┌─ Available Parameters ────────────────────────────────────┐          │
│ │ ☐ SOC (%)           ☐ Relay 0-5        ☐ Insulation      │          │
│ │ ☐ SOH (%)           ☐ Power Volt       ☐ Heartbeat       │          │
│ │ ☐ Cell Δ (mV)       ☐ Acc Voltage      ☐ Temp Max/Min    │          │
│ │ ☐ Temp Δ (°C)       ☐ DI1/DI2          ☐ Charging Time   │          │
│ └───────────────────────────────────────────────────────────┘          │
│                                                                         │
│ [Preview]  [Save to Dashboard]  [Export PNG]                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Multi-Parameter Overlay

Users can overlay multiple parameters on a single chart with dual Y-axes:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Custom: Wake Analysis - 08/18 Event                    [Edit] [Remove] │
├─────────────────────────────────────────────────────────────────────────┤
│ 90V ─┐                                                      ┌─ KEY ON  │
│      │  Pack Voltage                                        │          │
│ 80V ─│  ═══════════════════════════════════════════════════ │          │
│      │                                                      │          │
│ 70V ─│                                                      │          │
│      │                   ┌─────────────────────────────────┐│─ KEY OFF │
│ 60V ─│  ─────────────────│         15h 31m GAP            ││          │
│      │                   │    (No data logged)            ││          │
│ 50V ─┴───────────────────┴─────────────────────────────────┴┴──────────│
│      08/18      08/18    08/18                    08/19     08/19      │
│      13:55      15:15    15:35                    07:06     09:00      │
│                                                                         │
│      ── Pack V (left axis)  ▬▬ SW1 State (right axis)                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Parameter Categories

Organize available parameters by category for easier selection:

| Category | Parameters |
|----------|------------|
| **Voltage** | Pack V, Cell Max, Cell Min, Cell Δ, HV1-5, HVBPOS, Acc V |
| **Current** | Current, Current2, Charging Current, Feedback Current |
| **State** | System State, Wake Signal, SW1, SW2, DI1, DI2 |
| **Relays** | Relay 0-5 (with labels: Main+, Main-, Precharge, etc.) |
| **Thermal** | Temp 1-9, Temp Max, Temp Min, Temp Δ, TMS Temps |
| **SOC/SOH** | Shown SOC, Real SOC, SOH, Integral Ratio |
| **Insulation** | System Insul., Pos. Insul., Neg. Insul. |
| **Energy** | Charged Ah, Discharged Ah, Charged kWh, Discharged kWh |
| **Diagnostics** | Heartbeat, Power Volt, Reset Source, Fault Flags |

### 3.4 Chart Types

Allow users to select visualization type per parameter:

| Type | Best For |
|------|----------|
| **Line** | Continuous values (voltage, current, temp) |
| **Step** | Discrete states (relays, system state, SW1/SW2) |
| **Area** | Range visualization (cell spread, temp spread) |
| **Bar** | Event markers (faults, state changes) |
| **Scatter** | Correlation analysis |

### 3.5 Saved Chart Templates

Allow users to save and recall chart configurations:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Saved Templates                                                   [New] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ★ Wake Failure Analysis                                        [Load]  │
│   Pack V + SW1 + SW2 + Wake Signal + System State                      │
│                                                                         │
│ ★ Charging Profile                                             [Load]  │
│   Pack V + Current + SOC + Cell Max/Min + Relay States                 │
│                                                                         │
│ ★ Thermal Event Investigation                                  [Load]  │
│   All Temps + Current + Cell Δ + System State                          │
│                                                                         │
│ ★ Cell Health Check                                            [Load]  │
│   All 24 Cell Voltages + Balancing States                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Enhanced Data Gap Visualization

### Current State
- Data gaps appear as straight lines between points
- No visual indication of missing data periods

### Requested Enhancement

#### 4.1 Gap Highlighting

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│         Data Present     │░░░░░ DATA GAP ░░░░░│    Data Present        │
│ ═════════════════════════│   15h 31m 22s      │═════════════════════   │
│                          │   (Sleep Mode)      │                        │
│                          │                     │                        │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 4.2 Gap Summary Panel

When a gap is detected, show:
- Duration
- Last known state before gap
- First known state after gap
- Suspected reason (Sleep, Comm Loss, etc.)

---

## 5. Correlation Analysis Tool

### Concept

Allow users to select two parameters and visualize their correlation:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Correlation: Current vs Cell Δ                              R² = 0.847 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Cell Δ                                                                  │
│ (mV)                              ·  ·                                  │
│  120 ─                         ·  ·  ·                                  │
│  100 ─                      · ·  ·                                      │
│   80 ─                   ·  ·                                           │
│   60 ─               ·  ·                                               │
│   40 ─           ·  ·                                                   │
│   20 ─   ·  ·  ·                                                        │
│    0 ─┴─────────────────────────────────────────────────────────────   │
│        0    20    40    60    80   100   120   140                     │
│                        Current (A)                                      │
│                                                                         │
│ Finding: Cell spread increases linearly with current (IR effect)       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Technical Implementation Notes

### 6.1 Data Structure

All parameters should be accessible via a unified interface:

```javascript
const AVAILABLE_PARAMETERS = {
  // Voltage
  packVoltage:    { label: 'Pack Voltage', unit: 'V', sheet: '0x9A', column: 'Pack volt.(V)' },
  cellMax:        { label: 'Cell Max', unit: 'mV', sheet: '0x9B', column: 'Max cell(mv)' },
  cellMin:        { label: 'Cell Min', unit: 'mV', sheet: '0x9B', column: 'Min cell(mv)' },
  
  // State (with value mapping)
  sw1:            { label: 'Key Switch', unit: '', sheet: '0x93', column: 'SW1', 
                    valueMap: { 0: 'OFF', 1: 'ON' }, chartType: 'step' },
  sw2:            { label: 'Start Switch', unit: '', sheet: '0x93', column: 'SW2',
                    valueMap: { 0: 'OFF', 1: 'ENGAGED' }, chartType: 'step' },
  wakeSignal:     { label: 'Wake Source', unit: '', sheet: '0x93', column: 'Wake-up signal',
                    chartType: 'step' },
  systemState:    { label: 'System State', unit: '', sheet: '0x93', column: 'System state',
                    chartType: 'step' },
  
  // Relays (with descriptive labels)
  relay0:         { label: 'Relay 0 (Main+)', unit: '', sheet: '0x93', column: 'Relay 0',
                    valueMap: { 'Open': 0, 'Close': 1 }, chartType: 'step' },
  // ... etc
};
```

### 6.2 Chart Rendering

Use Recharts `ComposedChart` for multi-parameter overlays with mixed chart types:

```jsx
<ComposedChart data={filteredData}>
  <XAxis dataKey="time" />
  <YAxis yAxisId="left" /> {/* Voltage */}
  <YAxis yAxisId="right" orientation="right" /> {/* State */}
  
  <Line yAxisId="left" dataKey="packVoltage" type="monotone" />
  <Line yAxisId="right" dataKey="sw1" type="stepAfter" />
  <Area yAxisId="left" dataKey="cellRange" />
</ComposedChart>
```

### 6.3 State Value Display

For step charts with discrete states, show labels on hover:

```jsx
const CustomTooltip = ({ payload }) => (
  <div>
    <p>SW1: {payload.sw1 === 1 ? 'KEY ON' : 'KEY OFF'}</p>
    <p>System: {payload.systemState}</p>
  </div>
);
```

---

## 7. Priority Ranking

| Feature | Priority | Effort | Impact |
|---------|----------|--------|--------|
| SW1/SW2 human-readable labels | P1 | Low | High |
| Key Switch State timeline chart | P1 | Medium | High |
| System State timeline chart | P1 | Medium | High |
| Relay State monitor | P2 | Medium | Medium |
| Dynamic chart builder | P2 | High | Very High |
| Saved chart templates | P3 | Medium | High |
| Correlation analysis tool | P3 | High | Medium |
| Data gap highlighting | P2 | Low | Medium |

---

## 8. Acceptance Criteria

### 8.1 Key Switch Visualization
- [ ] SW1 displays "KEY ON" / "KEY OFF" instead of 1/0
- [ ] SW2 displays "START ENGAGED" / "START OFF" instead of 1/0
- [ ] Color coding: Green for ON/ENGAGED, Gray for OFF
- [ ] Key Switch State chart available on Overview page

### 8.2 Dynamic Charts
- [ ] User can select any parameter from categorized list
- [ ] User can assign parameters to left or right Y-axis
- [ ] Chart type auto-selected based on parameter type (line vs step)
- [ ] User can save chart configuration as template
- [ ] User can load saved templates

### 8.3 Data Gaps
- [ ] Gaps > 10 minutes visually highlighted
- [ ] Gap duration displayed
- [ ] Gap reason inferred and displayed (Sleep, Comm Loss, etc.)

---

## 9. Appendix: Full Parameter List

### From System State 0x93

| Parameter | Type | Chart Type | Notes |
|-----------|------|------------|-------|
| Heartbeat | int | line | Communication health |
| Power Volt | float | line | BMS supply voltage |
| Reset Source | enum | step | Last reset reason |
| Shown SOC | float | line | Displayed SOC |
| Real SOC | float | line | Calculated SOC |
| SOH | float | line | State of Health |
| Sys. Insul. Resistance | int | line | Main insulation |
| Pos. Insulation | int | line | Positive rail |
| Neg. Insulation | int | line | Negative rail |
| System State | enum | step | Charging/Discharging |
| Wake-up Signal | enum | step | KL15/KL15 OBC |
| Acc. Voltage | float | line | Accessory voltage |
| SW1 | bool | step | Key switch |
| SW2 | bool | step | Start switch |
| DI1 | bool | step | Digital input 1 |
| DI2 | bool | step | Digital input 2 |
| Relay 0-5 | bool | step | Contactor states |

### From Voltages 0x9A

| Parameter | Type | Chart Type |
|-----------|------|------------|
| Pack Voltage | float | line |
| Current | float | line |
| Current2 | float | line |
| Cell 0-23 | float | line |

### From Temperatures 0x09

| Parameter | Type | Chart Type |
|-----------|------|------------|
| CellTemp 1-9 | float | line |

### From Peak Data 0x9B

| Parameter | Type | Chart Type |
|-----------|------|------------|
| Max Cell | float | line |
| Min Cell | float | line |
| Max Temp | float | line |
| Min Temp | float | line |

---

*End of Document*
