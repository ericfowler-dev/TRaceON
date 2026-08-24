// =============================================================================
// VISUALIZATION METADATA AND STATE/GAP HELPERS
// =============================================================================

export const DATA_GAP_THRESHOLD_MS = 10 * 60 * 1000;

export const PARAMETER_CATEGORIES = {
  voltage: 'Voltage',
  current: 'Current',
  state: 'State',
  relays: 'Relays',
  thermal: 'Thermal',
  socSoh: 'SOC / SOH',
  insulation: 'Insulation',
  energy: 'Energy',
  diagnostics: 'Diagnostics'
};

const parameter = (category, label, unit, sheet, column, dataKey, chartType = 'line', extra = {}) => ({
  category,
  label,
  unit,
  sheet,
  column,
  dataKey,
  chartType,
  ...extra
});

// One catalog is shared by the chart data adapter and the upcoming custom chart
// builder so column names, labels, units, and state semantics cannot drift apart.
export const AVAILABLE_PARAMETERS = {
  packVoltage: parameter('voltage', 'Pack Voltage', 'V', '0x9A', 'Pack volt.(V)', 'packV'),
  cellMax: parameter('voltage', 'Cell Max', 'mV', '0x9B', 'Max cell(mv)', 'maxCell'),
  cellMin: parameter('voltage', 'Cell Min', 'mV', '0x9B', 'Min cell(mv)', 'minCell'),
  cellDelta: parameter('voltage', 'Cell Delta', 'mV', 'derived', 'Max - Min', 'cellDiff', 'area'),
  hvbpos: parameter('voltage', 'HVBPOS', 'V', '0x93', 'HVBPOS', 'hvbpos'),
  hv1: parameter('voltage', 'HV1', 'V', '0x93', 'HV1', 'hv1'),
  hv2: parameter('voltage', 'HV2', 'V', '0x93', 'HV2', 'hv2'),
  hv3: parameter('voltage', 'HV3', 'V', '0x93', 'HV3', 'hv3'),
  hv4: parameter('voltage', 'HV4', 'V', '0x93', 'HV4', 'hv4'),
  hv5: parameter('voltage', 'HV5', 'V', '0x93', 'HV5', 'hv5'),
  accVoltage: parameter('voltage', 'Accessory Voltage', 'V', '0x93', 'Acc. voltage', 'accVoltage'),

  current: parameter('current', 'Current', 'A', '0x9A', 'Current(A)', 'current'),
  chargeRequestCurrent: parameter('current', 'Charge Request Current', 'A', '0x99', 'Charge Req. Curr.', 'chargeReqCurr'),
  chargerOutputCurrent: parameter('current', 'Charger Output Current', 'A', '0x99', 'Charger Output Curr.', 'chargerOutputCurr'),

  systemState: parameter('state', 'System State', '', '0x93', 'System state', 'systemState', 'step'),
  wakeSignal: parameter('state', 'Wake Source', '', '0x93', 'Wake-up signal', 'wakeupSignal', 'step'),
  sw1: parameter('state', 'Key Switch', '', '0x93', 'SW1', 'sw1', 'step', {
    valueMap: { 0: 'KEY OFF', 1: 'KEY ON' }
  }),
  sw2: parameter('state', 'Start Switch', '', '0x93', 'SW2', 'sw2', 'step', {
    valueMap: { 0: 'START OFF', 1: 'START ENGAGED' }
  }),
  di1: parameter('state', 'Digital Input 1', '', '0x93', 'DI1', 'di1', 'step'),
  di2: parameter('state', 'Digital Input 2', '', '0x93', 'DI2', 'di2', 'step'),

  relay0: parameter('relays', 'Relay 0', '', '0x93', 'Relay 0', 'relay0', 'step'),
  relay1: parameter('relays', 'Relay 1', '', '0x93', 'Relay 1', 'relay1', 'step'),
  relay2: parameter('relays', 'Relay 2', '', '0x93', 'Relay 2', 'relay2', 'step'),
  relay3: parameter('relays', 'Relay 3', '', '0x93', 'Relay 3', 'relay3', 'step'),
  relay4: parameter('relays', 'Relay 4', '', '0x93', 'Relay 4', 'relay4', 'step'),
  relay5: parameter('relays', 'Relay 5', '', '0x93', 'Relay 5', 'relay5', 'step'),

  maxTemp: parameter('thermal', 'Temperature Max', '°C', '0x9B', 'Max temp.', 'maxTemp'),
  minTemp: parameter('thermal', 'Temperature Min', '°C', '0x9B', 'Min temp.', 'minTemp'),
  tempDelta: parameter('thermal', 'Temperature Delta', '°C', 'derived', 'Max - Min', 'tempDiff', 'area'),

  shownSoc: parameter('socSoh', 'Shown SOC', '%', '0x93', 'Shown SOC', 'soc'),
  realSoc: parameter('socSoh', 'Real SOC', '%', '0x93', 'Real SOC', 'realSoc'),
  soh: parameter('socSoh', 'State of Health', '%', '0x93', 'SOH', 'soh'),
  integralRatio: parameter('socSoh', 'Integral Ratio', '', '0x93', 'Integral ratio', 'integralRatio'),

  insulation: parameter('insulation', 'System Insulation', 'kΩ', '0x93', 'Sys. insul. resistance', 'insulationRes'),
  posInsulation: parameter('insulation', 'Positive Insulation', 'kΩ', '0x93', 'Pos. insulation', 'posInsulation'),
  negInsulation: parameter('insulation', 'Negative Insulation', 'kΩ', '0x93', 'Neg. insulation', 'negInsulation'),

  chargedEnergy: parameter('energy', 'Charged Energy', 'Ah', '0x89', 'Acc. charged energy', 'accChargedEnergy'),
  dischargedEnergy: parameter('energy', 'Discharged Energy', 'Ah', '0x89', 'Acc. discharged energy', 'accDischargedEnergy'),

  heartbeat: parameter('diagnostics', 'Heartbeat', '', '0x93', 'Heartbeat', 'heartbeat'),
  powerVolt: parameter('diagnostics', 'BMS Supply Voltage', 'mV', '0x93', 'Power volt', 'powerVolt'),
  resetSource: parameter('diagnostics', 'Reset Source', '', '0x93', 'Reset source', 'resetSource', 'step')
};

const ON_VALUES = new Set([
  '1', 'on', 'true', 'high', 'active', 'engaged', 'close', 'closed',
  'key on', 'start engaged'
]);
const OFF_VALUES = new Set([
  '0', 'off', 'false', 'low', 'inactive', 'disengaged', 'open',
  'key off', 'start off'
]);

export const normalizeBinaryState = (value) => {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  if (value == null) return null;

  const normalized = String(value).trim().toLowerCase();
  if (ON_VALUES.has(normalized)) return 1;
  if (OFF_VALUES.has(normalized)) return 0;
  return null;
};

export const formatSwitchState = (switchId, value) => {
  const normalized = normalizeBinaryState(value);
  if (normalized == null) return 'UNKNOWN';
  if (switchId === 'sw2') return normalized === 1 ? 'START ENGAGED' : 'START OFF';
  return normalized === 1 ? 'KEY ON' : 'KEY OFF';
};

export const getSwitchStateStyle = (switchId, value) => {
  const normalized = normalizeBinaryState(value);
  if (normalized !== 1) return 'bg-slate-700/70 text-slate-300 border-slate-600';
  return switchId === 'sw2'
    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
};

const summarizeState = (sample) => ({
  systemState: sample?.systemState || 'Unknown',
  wakeSignal: sample?.wakeupSignal || 'Unknown',
  sw1: formatSwitchState('sw1', sample?.sw1),
  sw2: formatSwitchState('sw2', sample?.sw2)
});

export const inferGapReason = (before, after) => {
  const combinedState = `${before?.systemState || ''} ${after?.systemState || ''}`.toLowerCase();
  if (combinedState.includes('sleep')) return 'Sleep (reported by BMS)';

  const keyOff = normalizeBinaryState(before?.sw1) === 0 && normalizeBinaryState(after?.sw1) === 0;
  const currents = [before?.current, after?.current].filter(Number.isFinite);
  const nearZeroCurrent = currents.length > 0 && currents.every(current => Math.abs(current) < 0.5);
  if (keyOff && nearZeroCurrent) return 'Sleep (inferred from key-off / idle current)';
  if (keyOff) return 'Possible sleep (key remained off)';
  return 'Communication or logging interruption';
};

export const detectDataGaps = (samples, thresholdMs = DATA_GAP_THRESHOLD_MS) => {
  if (!Array.isArray(samples) || samples.length < 2) return [];
  const gaps = [];

  for (let i = 1; i < samples.length; i++) {
    const before = samples[i - 1];
    const after = samples[i];
    if (!Number.isFinite(before?.ts) || !Number.isFinite(after?.ts)) continue;
    const durationMs = after.ts - before.ts;
    if (durationMs <= thresholdMs) continue;

    gaps.push({
      id: `${before.ts}-${after.ts}`,
      startTs: before.ts,
      endTs: after.ts,
      durationMs,
      durationMinutes: durationMs / 60000,
      before: summarizeState(before),
      after: summarizeState(after),
      reason: inferGapReason(before, after)
    });
  }

  return gaps;
};

export const findSwitchTransitions = (samples) => {
  if (!Array.isArray(samples)) return [];
  const transitions = [];
  let lastSw1 = null;
  let lastSw2 = null;
  let hasSw1 = false;
  let hasSw2 = false;

  for (const sample of samples) {
    if (!Number.isFinite(sample?.ts)) continue;
    const sw1 = normalizeBinaryState(sample.sw1);
    const sw2 = normalizeBinaryState(sample.sw2);

    if (sw1 != null) {
      if (hasSw1 && sw1 !== lastSw1) {
        transitions.push({
          ts: sample.ts,
          time: sample.time,
          type: 'sw1',
          value: sw1,
          label: formatSwitchState('sw1', sw1),
          color: sw1 === 1 ? '#22c55e' : '#ef4444'
        });
      }
      hasSw1 = true;
      lastSw1 = sw1;
    }

    if (sw2 != null) {
      if (hasSw2 && sw2 !== lastSw2 && sw2 === 1) {
        transitions.push({
          ts: sample.ts,
          time: sample.time,
          type: 'sw2',
          value: sw2,
          label: formatSwitchState('sw2', sw2),
          color: '#f59e0b'
        });
      }
      hasSw2 = true;
      lastSw2 = sw2;
    }
  }

  return transitions;
};

export const buildSwitchTimelineData = (samples, thresholdMs = DATA_GAP_THRESHOLD_MS) => {
  if (!Array.isArray(samples)) return [];
  const result = [];
  let sw1 = null;
  let sw2 = null;
  let lastReadingTs = null;
  let lastSample = null;

  for (const sample of samples) {
    if (!Number.isFinite(sample?.ts)) continue;
    const nextSw1 = normalizeBinaryState(sample.sw1);
    const nextSw2 = normalizeBinaryState(sample.sw2);
    if (nextSw1 == null && nextSw2 == null) continue;

    const resolvedSw1 = nextSw1 ?? sw1;
    const resolvedSw2 = nextSw2 ?? sw2;
    const changed = resolvedSw1 !== sw1 || resolvedSw2 !== sw2;
    const hasGap = lastReadingTs != null && sample.ts - lastReadingTs > thresholdMs;

    if (hasGap) {
      result.push({
        ts: lastReadingTs + ((sample.ts - lastReadingTs) / 2),
        time: null,
        sw1Lane: null,
        sw2Lane: null,
        isGap: true
      });
    }

    if (result.length === 0 || changed || hasGap) {
      result.push({
        ts: sample.ts,
        time: sample.time,
        sw1Lane: resolvedSw1,
        sw2Lane: resolvedSw2 == null ? null : resolvedSw2 + 2,
        sw1: resolvedSw1,
        sw2: resolvedSw2
      });
    }

    sw1 = resolvedSw1;
    sw2 = resolvedSw2;
    lastReadingTs = sample.ts;
    lastSample = sample;
  }

  if (lastSample && result.at(-1)?.ts !== lastSample.ts) {
    result.push({
      ts: lastSample.ts,
      time: lastSample.time,
      sw1Lane: sw1,
      sw2Lane: sw2 == null ? null : sw2 + 2,
      sw1,
      sw2
    });
  }

  return result;
};

