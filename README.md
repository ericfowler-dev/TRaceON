# BMS Analyzer

Browser-based analysis for PSI LiFePO₄ battery-management-system Excel logs. The application normalizes workbook streams in a Web Worker, detects BMS fault lifecycles and derived conditions, and provides charts, snapshot playback, event review, and PDF export.

> This is a diagnostic aid, not a safety controller. Level 3 findings require confirmation against the applicable PSI product documentation and qualified service procedures.

## Analysis capabilities

- PSI three-level voltage, temperature, SOC, SOH, insulation, and compound-fault rules
- Context-aware cell-imbalance thresholds for rest, CC/CV charging, discharge load, and active balancing
- Separate absolute-voltage and relative-balance heat maps with LiFePO₄ min/nominal/full/max references
- Charge-to-rest convergence recognition that identifies healthy fan-out-and-converge behavior
- Current-polarity inference from authoritative system-state telemetry
- Persistence filtering and configurable strict, balanced, and relaxed sensitivity
- Consolidated anomaly events with start/end time, duration, sample count, peak severity, and operating state
- Data-quality separation for impossible sensor values
- Native BMS alarm lifecycle tracking, including severity transitions
- Multi-frame cell parsing for 24S, 32S, and 2P24S/48-cell logs
- Worker-side workbook dimension limits and a 50 MB upload limit

## Run locally

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm test
npm run lint
npm run build
```

## Supported input

The parser targets PSI workbook sheets identified by their descriptive name or CAN identifier, including voltage `0x9A`, temperature `0x09`, peak `0x9B`, system state `0x93`, alarms `0x87`, balancing `0x86`, energy `0x89`, and charging `0x99`.

Analysis occurs locally in the browser. Workbook contents are not uploaded by the application.

## Threshold provenance

The current rules are based on:

- `PSI_LiIon_Battery_Anomaly_Detection_v2.md`
- `Update-21AU2026/bms-analyzer-anomaly-improvements-21AU2026.md`
- `Update-21AU2026/bms-analyzer-charging-spread-clarification.md`

The charging-spread clarification supersedes the earlier generic balance table: imbalance is diagnosed after 15 continuous minutes below 0.5 A, while charging/discharging spread is treated as normal internal-resistance behavior unless it exceeds the applicable extreme guard. The imbalance chart labels its 20/35/50 mV guides explicitly as settled-rest references.

## Known follow-up work

- Model selection is still ambiguous between 24-cell 80V230Ah and 80V304Ah packs when metadata does not identify capacity.
- Current-duration limits, full rate-of-change coverage, stateful set/clear hysteresis, data-quality scoring, and remaining PSI compound rules need dedicated detector modules and boundary tests.
- The npm `xlsx` package has published security advisories and no registry fix. Parsing is isolated in a worker and bounded, but migration to a maintained workbook reader remains a priority.
- The main UI bundle should be split by dynamically loading PDF/report dependencies.
