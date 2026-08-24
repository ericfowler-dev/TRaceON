import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AVAILABLE_PARAMETERS,
  DATA_GAP_THRESHOLD_MS,
  buildSwitchTimelineData,
  detectDataGaps,
  findSwitchTransitions,
  formatSwitchState,
  normalizeBinaryState
} from '../src/lib/visualization.js';

const sample = (minutes, values = {}) => ({
  ts: Date.UTC(2026, 7, 18, 12, minutes),
  time: new Date(Date.UTC(2026, 7, 18, 12, minutes)),
  ...values
});

test('normalizes common BMS switch encodings and keeps unknown values explicit', () => {
  assert.equal(normalizeBinaryState('1'), 1);
  assert.equal(normalizeBinaryState('Close'), 1);
  assert.equal(normalizeBinaryState('OFF'), 0);
  assert.equal(normalizeBinaryState(false), 0);
  assert.equal(normalizeBinaryState('Invalid'), null);
});

test('formats SW1 and SW2 as diagnostic labels', () => {
  assert.equal(formatSwitchState('sw1', 1), 'KEY ON');
  assert.equal(formatSwitchState('sw1', 0), 'KEY OFF');
  assert.equal(formatSwitchState('sw2', '1'), 'START ENGAGED');
  assert.equal(formatSwitchState('sw2', '0'), 'START OFF');
});

test('detects only data gaps longer than ten minutes and summarizes surrounding state', () => {
  const exactThreshold = detectDataGaps([
    sample(0, { sw1: 0, current: 0 }),
    sample(10, { sw1: 0, current: 0 })
  ]);
  assert.equal(exactThreshold.length, 0);

  const gaps = detectDataGaps([
    sample(0, { sw1: 0, sw2: 0, current: 0, systemState: 'Standby' }),
    sample(11, { sw1: 0, sw2: 0, current: 0, systemState: 'Standby' })
  ]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].durationMs, 11 * 60 * 1000);
  assert.match(gaps[0].reason, /Sleep \(inferred/);
  assert.equal(gaps[0].before.sw1, 'KEY OFF');
  assert.equal(gaps[0].after.sw2, 'START OFF');
});

test('finds key-on, key-off, and start-engaged transitions without treating the initial state as an event', () => {
  const transitions = findSwitchTransitions([
    sample(0, { sw1: 0, sw2: 0 }),
    sample(1, { sw1: 1, sw2: 0 }),
    sample(2, { sw1: 1, sw2: 1 }),
    sample(3, { sw1: 0, sw2: 0 })
  ]);

  assert.deepEqual(transitions.map(event => event.label), ['KEY ON', 'START ENGAGED', 'KEY OFF']);
  assert.deepEqual(transitions.map(event => event.color), ['#22c55e', '#f59e0b', '#ef4444']);
});

test('switch timeline compresses stable samples and inserts a null break for a data gap', () => {
  const timeline = buildSwitchTimelineData([
    sample(0, { sw1: 0, sw2: 0 }),
    sample(1, { sw1: 0, sw2: 0 }),
    sample(2, { sw1: 1, sw2: 0 }),
    sample(20, { sw1: 1, sw2: 0 })
  ], DATA_GAP_THRESHOLD_MS);

  assert.ok(timeline.length < 4 + 2);
  assert.ok(timeline.some(point => point.isGap && point.sw1Lane == null && point.sw2Lane == null));
  assert.equal(timeline.find(point => point.ts === sample(2).ts).sw1Lane, 1);
});

test('parameter catalog exposes axis-ready metadata and step defaults for state signals', () => {
  assert.deepEqual(
    {
      category: AVAILABLE_PARAMETERS.packVoltage.category,
      unit: AVAILABLE_PARAMETERS.packVoltage.unit,
      dataKey: AVAILABLE_PARAMETERS.packVoltage.dataKey
    },
    { category: 'voltage', unit: 'V', dataKey: 'packV' }
  );
  assert.equal(AVAILABLE_PARAMETERS.sw1.chartType, 'step');
  assert.equal(AVAILABLE_PARAMETERS.sw1.valueMap[1], 'KEY ON');
});

