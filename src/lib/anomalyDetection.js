// =============================================================================
// CONTEXT-AWARE ANOMALY EVENT PIPELINE
// =============================================================================

export const OPERATING_STATES = Object.freeze({
  REST: 'REST',
  REST_PENDING: 'REST_PENDING',
  CHARGING_CV: 'CHARGING_CV',
  CHARGING_CC_LOW: 'CHARGING_CC_LOW',
  CHARGING_CC_HIGH: 'CHARGING_CC_HIGH',
  DISCHARGING_LOW: 'DISCHARGING_LOW',
  DISCHARGING_HIGH: 'DISCHARGING_HIGH',
  BALANCING: 'BALANCING',
  UNKNOWN: 'UNKNOWN'
});

// Superseded by bms-analyzer-charging-spread-clarification.md. Active-current
// spread is normally IR-related and is not diagnosed as imbalance unless it is
// extreme. Values are full pack spread in mV; null means no advisory tier.
export const CELL_BALANCE_THRESHOLDS = Object.freeze({
  [OPERATING_STATES.REST]: { ignore: 20, info: 20, warning: 35, critical: 50 },
  [OPERATING_STATES.REST_PENDING]: { ignore: 200, info: null, warning: null, critical: 200 },
  [OPERATING_STATES.CHARGING_CV]: { ignore: 80, info: null, warning: null, critical: 120 },
  [OPERATING_STATES.CHARGING_CC_LOW]: { ignore: 150, info: null, warning: null, critical: 200 },
  [OPERATING_STATES.CHARGING_CC_HIGH]: { ignore: 150, info: null, warning: null, critical: 200 },
  [OPERATING_STATES.DISCHARGING_LOW]: { ignore: 120, info: null, warning: null, critical: 180 },
  [OPERATING_STATES.DISCHARGING_HIGH]: { ignore: 120, info: null, warning: null, critical: 180 },
  [OPERATING_STATES.BALANCING]: { ignore: 200, info: null, warning: null, critical: 300 },
  [OPERATING_STATES.UNKNOWN]: { ignore: 200, info: null, warning: null, critical: 200 }
});

export const SENSITIVITY_PRESETS = Object.freeze({
  strict: { debounce: 1, thresholdMultiplier: 0.8, aggregationWindowSeconds: 60 },
  balanced: { debounce: 3, thresholdMultiplier: 1, aggregationWindowSeconds: 300 },
  relaxed: { debounce: 5, thresholdMultiplier: 1.3, aggregationWindowSeconds: 600 }
});

export const DEFAULT_ANALYSIS_OPTIONS = Object.freeze({
  sensitivityPreset: 'balanced',
  restCurrentThresholdA: 0.5,
  restMinDurationSeconds: 900,
  restMaxSampleGapSeconds: 120
});

const getTimestamp = (value) => {
  if (Number.isFinite(value?.ts)) return value.ts;
  if (value?.time instanceof Date) return value.time.getTime();
  const parsed = new Date(value?.time).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const isBalancing = (sample) => Object.values(sample?.balancing || {}).some(state => state === 'ACTIVE');

const inferChargeCurrentSign = (samples) => {
  let positiveScore = 0;
  let negativeScore = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample.current) || Math.abs(sample.current) <= 0.5) continue;
    const stateText = String(sample.systemState || '').toLowerCase();
    const explicitlyCharging = stateText.includes('charg') && !stateText.includes('discharg');
    const explicitlyDischarging = stateText.includes('discharg');
    if (!explicitlyCharging && !explicitlyDischarging) continue;
    const agreesWithPositive = (explicitlyCharging && sample.current > 0)
      || (explicitlyDischarging && sample.current < 0);
    if (agreesWithPositive) positiveScore += 1;
    else negativeScore += 1;
  }
  // Preserve the legacy log convention when the file contains no evidence.
  return positiveScore > negativeScore ? 1 : -1;
};

/**
 * Annotate samples with a contextual operating state.
 * The sign convention is inferred from explicit system-state samples because
 * field logs are not consistent across firmware versions.
 */
export const annotateOperatingStates = (samples, options = {}) => {
  const restCurrentThresholdA = options.restCurrentThresholdA ?? DEFAULT_ANALYSIS_OPTIONS.restCurrentThresholdA;
  const restMinDurationMs = (options.restMinDurationSeconds ?? DEFAULT_ANALYSIS_OPTIONS.restMinDurationSeconds) * 1000;
  const restMaxSampleGapMs = (options.restMaxSampleGapSeconds ?? DEFAULT_ANALYSIS_OPTIONS.restMaxSampleGapSeconds) * 1000;
  const capacityAh = Number.isFinite(options.capacityAh) ? options.capacityAh : null;
  const chargeCurrentSign = options.chargeCurrentSign === 1 || options.chargeCurrentSign === -1
    ? options.chargeCurrentSign
    : inferChargeCurrentSign(samples);
  let restStartedAt = null;
  let previousTs = null;

  for (const sample of samples) {
    const ts = getTimestamp(sample);
    const current = Number.isFinite(sample.current) ? sample.current : null;
    const absCurrent = current == null ? null : Math.abs(current);
    const stateText = String(sample.systemState || '').toLowerCase();

    if (previousTs != null && ts - previousTs > restMaxSampleGapMs) restStartedAt = null;
    previousTs = ts;

    if (isBalancing(sample)) {
      sample.operatingState = OPERATING_STATES.BALANCING;
      restStartedAt = null;
      continue;
    }

    if (absCurrent != null && absCurrent <= restCurrentThresholdA) {
      if (restStartedAt == null) restStartedAt = ts;
      sample.operatingState = ts - restStartedAt >= restMinDurationMs
        ? OPERATING_STATES.REST
        : OPERATING_STATES.REST_PENDING;
      continue;
    }

    restStartedAt = null;
    const explicitlyCharging = stateText.includes('charg') && !stateText.includes('discharg');
    const explicitlyDischarging = stateText.includes('discharg');
    const charging = explicitlyCharging || (!explicitlyDischarging && current != null
      && Math.sign(current) === chargeCurrentSign);
    const discharging = explicitlyDischarging || (!explicitlyCharging && current != null
      && Math.sign(current) === -chargeCurrentSign);

    if (charging) {
      if (sample.soc > 95 && absCurrent < 20) {
        sample.operatingState = OPERATING_STATES.CHARGING_CV;
      } else {
        const highCurrentBoundary = capacityAh ? capacityAh * 0.3 : 50;
        sample.operatingState = absCurrent >= highCurrentBoundary
          ? OPERATING_STATES.CHARGING_CC_HIGH
          : OPERATING_STATES.CHARGING_CC_LOW;
      }
    } else if (discharging) {
      const highCurrentBoundary = capacityAh ? capacityAh * 0.5 : 100;
      sample.operatingState = absCurrent >= highCurrentBoundary
        ? OPERATING_STATES.DISCHARGING_HIGH
        : OPERATING_STATES.DISCHARGING_LOW;
    } else {
      sample.operatingState = OPERATING_STATES.UNKNOWN;
    }
  }

  return samples;
};

export const getCellBalanceThresholds = (operatingState, sensitivityPreset = 'balanced') => {
  const base = CELL_BALANCE_THRESHOLDS[operatingState] || CELL_BALANCE_THRESHOLDS.UNKNOWN;
  // Sensitivity affects settled-rest diagnostics only. Active-state extreme
  // guards stay fixed so "strict" cannot relabel normal charging fan-out.
  const multiplier = operatingState === OPERATING_STATES.REST
    ? SENSITIVITY_PRESETS[sensitivityPreset]?.thresholdMultiplier
      ?? SENSITIVITY_PRESETS.balanced.thresholdMultiplier
    : 1;
  const scaled = (value) => value == null ? null : Math.round(value * multiplier);
  return {
    ignore: scaled(base.ignore),
    info: scaled(base.info),
    warning: scaled(base.warning),
    critical: scaled(base.critical)
  };
};

export const classifyCellImbalance = (value, operatingState, sensitivityPreset = 'balanced') => {
  if (!Number.isFinite(value)) return 0;
  const thresholds = getCellBalanceThresholds(operatingState, sensitivityPreset);
  if (value > thresholds.critical) return 3;
  if (thresholds.warning != null && value >= thresholds.warning) return 2;
  if (thresholds.info != null && value >= thresholds.info) return 1;
  return 0;
};

/** Analyze the latest completed charge-to-settled-rest cycle. */
export const analyzeChargeConvergence = (samples, options = {}) => {
  const minRestMs = (options.minRestMinutes ?? 15) * 60 * 1000;
  let activeCharge = null;
  let pendingCharge = null;
  let latestAnalysis = null;

  for (const sample of samples) {
    const ts = getTimestamp(sample);
    const charging = sample.operatingState?.startsWith('CHARGING');
    const spread = Number.isFinite(sample.cellDiff) ? sample.cellDiff : null;

    if (charging) {
      if (!activeCharge) {
        activeCharge = {
          chargeStartTime: sample.time,
          chargeStartTs: ts,
          chargeEndTime: sample.time,
          chargeEndTs: ts,
          spreadAtChargeEnd: spread,
          peakChargingSpread: spread,
          sampleCount: 1
        };
      } else {
        activeCharge.chargeEndTime = sample.time;
        activeCharge.chargeEndTs = ts;
        activeCharge.sampleCount += 1;
        if (spread != null) {
          activeCharge.spreadAtChargeEnd = spread;
          activeCharge.peakChargingSpread = activeCharge.peakChargingSpread == null
            ? spread
            : Math.max(activeCharge.peakChargingSpread, spread);
        }
      }
      pendingCharge = null;
      continue;
    }

    if (activeCharge) {
      const sustainedCharge = activeCharge.sampleCount >= 2
        && activeCharge.chargeEndTs - activeCharge.chargeStartTs >= 30_000;
      pendingCharge = sustainedCharge ? activeCharge : null;
      activeCharge = null;
    }

    if (!pendingCharge || sample.operatingState !== OPERATING_STATES.REST || spread == null) continue;
    if (ts - pendingCharge.chargeEndTs < minRestMs || pendingCharge.peakChargingSpread == null) continue;

    const convergenceRatio = pendingCharge.peakChargingSpread > 0
      ? spread / pendingCharge.peakChargingSpread
      : null;
    const reductionPercent = convergenceRatio == null ? null : Math.max(0, (1 - convergenceRatio) * 100);
    let status = 'ATTENTION';
    let severity = 2;
    if (spread < 35 && convergenceRatio != null && convergenceRatio < 0.4) {
      status = 'HEALTHY';
      severity = 0;
    } else if (spread <= 50) {
      status = 'MONITOR';
      severity = 1;
    }

    latestAnalysis = {
      ...pendingCharge,
      restTime: sample.time,
      restTs: ts,
      restMinutes: (ts - pendingCharge.chargeEndTs) / 60000,
      spreadAtRest: spread,
      convergenceRatio,
      reductionPercent,
      healthy: status === 'HEALTHY',
      status,
      severity
    };
    pendingCharge = null;
  }

  return latestAnalysis;
};

const anomalyIdentity = (anomaly) => {
  const cells = (anomaly.cells || []).map(cell => cell.cell).filter(cell => cell != null).sort().join(',');
  return [anomaly.type || 'unknown', anomaly.code || anomaly.param || 'general', cells || 'pack'].join(':');
};

const debounceRequirement = (anomaly, sensitivityPreset) => {
  if ((anomaly.severity || 0) >= 3 || anomaly.type === 'compound_fault' || anomaly.type === 'config_mismatch') {
    return 1;
  }
  const presetDebounce = SENSITIVITY_PRESETS[sensitivityPreset]?.debounce
    ?? SENSITIVITY_PRESETS.balanced.debounce;
  if (sensitivityPreset === 'strict') return 1;

  const balancedMinimums = {
    cell_imbalance: 3,
    voltage_outlier: 3,
    cell_voltage_spec: 2,
    pack_voltage: 2,
    temperature: 2,
    temp_imbalance: 2,
    insulation: 5,
    sensor_fault: 1,
    data_fault: 1,
    soc_data_fault: 1
  };
  const balancedMinimum = balancedMinimums[anomaly.type] ?? presetDebounce;
  return sensitivityPreset === 'relaxed'
    ? Math.max(balancedMinimum, presetDebounce)
    : balancedMinimum;
};

/** Keep complete persistent runs while dropping transient non-critical runs. */
export const debounceAnomalies = (anomalies, options = {}) => {
  const sensitivityPreset = options.sensitivityPreset || DEFAULT_ANALYSIS_OPTIONS.sensitivityPreset;
  const groups = new Map();

  for (const anomaly of anomalies) {
    const key = anomalyIdentity(anomaly);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(anomaly);
  }

  const kept = [];
  for (const group of groups.values()) {
    group.sort((a, b) => (a.sampleIndex ?? 0) - (b.sampleIndex ?? 0) || getTimestamp(a) - getTimestamp(b));
    let run = [];
    let previousIndex = null;

    const flush = () => {
      if (!run.length) return;
      const required = Math.min(...run.map(anomaly => debounceRequirement(anomaly, sensitivityPreset)));
      if (run.length >= required) kept.push(...run);
      run = [];
    };

    for (const anomaly of group) {
      const index = anomaly.sampleIndex;
      if (previousIndex != null && index != null && index > previousIndex + 1) flush();
      run.push(anomaly);
      previousIndex = index;
    }
    flush();
  }

  return kept.sort((a, b) => getTimestamp(a) - getTimestamp(b));
};

const anomalyPeakValue = (anomaly) => {
  if (Number.isFinite(anomaly.value)) return anomaly.value;
  const values = (anomaly.cells || []).map(cell => Number(cell.voltage)).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
};

/** Consolidate interleaved sample-level anomalies into independent event windows. */
export const consolidateAnomalies = (anomalies, options = {}) => {
  if (!anomalies.length) return [];
  const sensitivityPreset = options.sensitivityPreset || DEFAULT_ANALYSIS_OPTIONS.sensitivityPreset;
  const windowSeconds = options.windowSeconds
    ?? SENSITIVITY_PRESETS[sensitivityPreset]?.aggregationWindowSeconds
    ?? SENSITIVITY_PRESETS.balanced.aggregationWindowSeconds;
  const windowMs = windowSeconds * 1000;
  const activeEvents = new Map();
  const consolidated = [];

  const closeEvent = (event) => {
    const durationMs = Math.max(0, event.endTs - event.startTs);
    const { cellMap, stateSet, ...eventData } = event;
    consolidated.push({
      ...eventData,
      time: event.startTime,
      timeStr: event.startTime.toLocaleString(),
      endTimeStr: event.endTime.toLocaleString(),
      durationMs,
      durationSeconds: durationMs / 1000,
      cells: [...cellMap.values()],
      operatingStates: [...stateSet],
      operatingState: stateSet.size === 1 ? [...stateSet][0] : 'MIXED'
    });
  };

  const sorted = [...anomalies].sort((a, b) => getTimestamp(a) - getTimestamp(b));
  for (const anomaly of sorted) {
    const key = anomalyIdentity(anomaly);
    const ts = getTimestamp(anomaly);
    const current = activeEvents.get(key);
    const peakValue = anomalyPeakValue(anomaly);

    if (current && ts - current.endTs <= windowMs) {
      current.endTs = ts;
      current.endTime = anomaly.time instanceof Date ? anomaly.time : new Date(ts);
      current.sampleCount += 1;
      if (peakValue != null && (current.peakValue == null || Math.abs(peakValue) > Math.abs(current.peakValue))) {
        current.peakValue = peakValue;
      }
      if ((anomaly.severity || 0) > current.severity) {
        current.severity = anomaly.severity;
        current.peakSeverity = anomaly.severity;
        current.description = anomaly.description;
      }
      for (const cell of anomaly.cells || []) current.cellMap.set(cell.cell, cell);
      if (anomaly.operatingState) current.stateSet.add(anomaly.operatingState);
      continue;
    }

    if (current) closeEvent(current);
    const startTime = anomaly.time instanceof Date ? anomaly.time : new Date(ts);
    activeEvents.set(key, {
      key,
      type: anomaly.type,
      code: anomaly.code,
      description: anomaly.description,
      severity: anomaly.severity || 1,
      peakSeverity: anomaly.severity || 1,
      startTs: ts,
      endTs: ts,
      startTime,
      endTime: startTime,
      sampleCount: 1,
      peakValue,
      cellMap: new Map((anomaly.cells || []).map(cell => [cell.cell, cell])),
      stateSet: new Set(anomaly.operatingState ? [anomaly.operatingState] : []),
      snapshot: anomaly.snapshot
    });
  }

  for (const event of activeEvents.values()) closeEvent(event);
  return consolidated.sort((a, b) => b.startTs - a.startTs);
};
