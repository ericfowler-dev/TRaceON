import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OPERATING_STATES,
  analyzeChargeConvergence,
  annotateOperatingStates,
  classifyCellImbalance,
  debounceAnomalies,
  consolidateAnomalies
} from '../src/lib/anomalyDetection.js';
import { processData } from '../src/lib/processData.js';
import { getRelayConfig } from '../src/lib/thresholds.js';

const at = (seconds) => new Date(2026, 0, 1, 0, 0, seconds);

test('infers current polarity from authoritative system state', () => {
  const samples = [0, 1, 2].map(index => ({
    ts: at(index).getTime(),
    time: at(index),
    current: -43,
    systemState: 'Discharging',
    balancing: {}
  }));

  annotateOperatingStates(samples, { capacityAh: 230 });
  assert.ok(samples.every(sample => sample.operatingState === OPERATING_STATES.DISCHARGING_LOW));
});

test('defaults supported 80V relay mapping to 12V Auxiliary', () => {
  const config = getRelayConfig({}, 24);
  assert.equal(config.Relay3, 'Pre-charge Relay');
  assert.equal(config.Relay4, 'Negative Relay');
  assert.equal(config.Relay5, 'DC/DC Relay');

  const ninetySixVoltConfig = getRelayConfig({}, 32);
  assert.equal(ninetySixVoltConfig.Relay3, 'Alarm Relay');
});

test('requires continuous near-zero current before declaring rest', () => {
  const samples = Array.from({ length: 16 }, (_, index) => index * 60).map(seconds => ({
    ts: at(seconds).getTime(),
    time: at(seconds),
    current: 0,
    balancing: {}
  }));

  annotateOperatingStates(samples, { restMaxSampleGapSeconds: 61 });
  assert.equal(samples[14].operatingState, OPERATING_STATES.REST_PENDING);
  assert.equal(samples[15].operatingState, OPERATING_STATES.REST);

  const gapped = [0, 960].map(seconds => ({ ts: at(seconds).getTime(), time: at(seconds), current: 0, balancing: {} }));
  annotateOperatingStates(gapped, { restMaxSampleGapSeconds: 61 });
  assert.equal(gapped[1].operatingState, OPERATING_STATES.REST_PENDING);
});

test('classifies the same cell spread by operating context', () => {
  assert.equal(classifyCellImbalance(55, OPERATING_STATES.REST), 3);
  assert.equal(classifyCellImbalance(55, OPERATING_STATES.CHARGING_CC_HIGH), 0);
  assert.equal(classifyCellImbalance(55, OPERATING_STATES.DISCHARGING_LOW), 0);
  assert.equal(classifyCellImbalance(200, OPERATING_STATES.CHARGING_CC_HIGH), 0);
  assert.equal(classifyCellImbalance(201, OPERATING_STATES.CHARGING_CC_HIGH), 3);
  assert.equal(classifyCellImbalance(120, OPERATING_STATES.CHARGING_CV), 0);
  assert.equal(classifyCellImbalance(121, OPERATING_STATES.CHARGING_CV), 3);
  assert.equal(classifyCellImbalance(180, OPERATING_STATES.DISCHARGING_HIGH), 0);
  assert.equal(classifyCellImbalance(181, OPERATING_STATES.DISCHARGING_HIGH), 3);
});

test('recognizes healthy charge fan-out followed by rest convergence', () => {
  const samples = [
    { time: at(0), ts: at(0).getTime(), operatingState: OPERATING_STATES.CHARGING_CC_HIGH, cellDiff: 110 },
    { time: at(60), ts: at(60).getTime(), operatingState: OPERATING_STATES.CHARGING_CV, cellDiff: 45 },
    { time: at(60 * 21), ts: at(60 * 21).getTime(), operatingState: OPERATING_STATES.REST, cellDiff: 22 }
  ];

  const result = analyzeChargeConvergence(samples);
  assert.equal(result.status, 'HEALTHY');
  assert.equal(result.peakChargingSpread, 110);
  assert.equal(result.spreadAtRest, 22);
  assert.equal(result.reductionPercent, 80);
});

test('advises monitoring when cells converge but settled-rest spread remains elevated', () => {
  const samples = [
    { time: at(0), ts: at(0).getTime(), operatingState: OPERATING_STATES.CHARGING_CC_HIGH, cellDiff: 130 },
    { time: at(60), ts: at(60).getTime(), operatingState: OPERATING_STATES.CHARGING_CV, cellDiff: 70 },
    { time: at(60 * 21), ts: at(60 * 21).getTime(), operatingState: OPERATING_STATES.REST, cellDiff: 48 }
  ];

  assert.equal(analyzeChargeConvergence(samples).status, 'MONITOR');
});

test('does not call a single charging sample a completed charge cycle', () => {
  const samples = [
    { time: at(0), ts: at(0).getTime(), operatingState: OPERATING_STATES.CHARGING_CC_LOW, cellDiff: 33 },
    { time: at(60 * 20), ts: at(60 * 20).getTime(), operatingState: OPERATING_STATES.REST, cellDiff: 57 }
  ];

  assert.equal(analyzeChargeConvergence(samples), null);
});

test('debounce retains persistent runs and drops isolated samples', () => {
  const make = (sampleIndex) => ({
    type: 'cell_imbalance',
    time: at(sampleIndex),
    ts: at(sampleIndex).getTime(),
    sampleIndex,
    severity: 2,
    cells: []
  });

  assert.equal(debounceAnomalies([make(0), make(2), make(4)]).length, 0);
  assert.equal(debounceAnomalies([make(0), make(1), make(2)]).length, 3);
});

test('consolidates interleaved anomaly types independently', () => {
  const anomaly = (type, seconds) => ({
    type,
    time: at(seconds),
    ts: at(seconds).getTime(),
    severity: 2,
    description: type,
    cells: [],
    operatingState: OPERATING_STATES.REST
  });
  const events = consolidateAnomalies([
    anomaly('cell_imbalance', 0),
    anomaly('temperature', 1),
    anomaly('cell_imbalance', 2)
  ]);

  assert.equal(events.length, 2);
  assert.equal(events.find(event => event.type === 'cell_imbalance').sampleCount, 2);
  assert.equal(events.find(event => event.type === 'temperature').sampleCount, 1);
});

test('processData preserves zero values and combines multi-frame cells', () => {
  const time = '2026/1/1 00:00:00';
  const sheets = {
    'Voltages 0x9A': [
      {
        Time: time,
        'Pack volt.(V)': '13.2',
        'Current(A)': '0',
        "This frame's starting cell index N": '0',
        'Cell volt.N+0(mV)': '3300',
        'Cell volt.N+1(mV)': '3301'
      },
      {
        Time: time,
        'Pack volt.(V)': '13.2',
        'Current(A)': '0',
        "This frame's starting cell index N": '2',
        'Cell volt.N+0(mV)': '3302',
        'Cell volt.N+1(mV)': '3303'
      }
    ],
    'System State 0x93': [{ Time: time, 'Shown SOC': '0', 'Real SOC': '0', SOH: '0' }]
  };

  const result = processData(sheets);
  assert.deepEqual(result.timeSeries[0].cells, { 0: 3300, 1: 3301, 2: 3302, 3: 3303 });
  assert.equal(result.timeSeries[0].soc, 0);
  assert.equal(result.timeSeries[0].soh, 0);
});

test('processData normalizes digital switch values for visualization', () => {
  const result = processData({
    'System State 0x93': [{
      Time: '2026/1/1 00:00:00',
      SW1: 'Close',
      SW2: '0',
      DI1: 'ON',
      DI2: 'Open'
    }]
  });

  assert.deepEqual(
    {
      sw1: result.timeSeries[0].sw1,
      sw2: result.timeSeries[0].sw2,
      di1: result.timeSeries[0].di1,
      di2: result.timeSeries[0].di2
    },
    { sw1: 1, sw2: 0, di1: 1, di2: 0 }
  );
});

test('impossible voltage is a sensor event, not a cell-health event', () => {
  const time = '2026/1/1 00:00:00';
  const result = processData({
    'Voltages 0x9A': [{
      Time: time,
      'Pack volt.(V)': '10',
      'Current(A)': '0',
      'Cell volt.N+0(mV)': '3300',
      'Cell volt.N+1(mV)': '3301',
      'Cell volt.N+2(mV)': '65024'
    }]
  });

  assert.ok(result.anomalies.some(event => event.type === 'sensor_fault'));
  assert.ok(!result.anomalies.some(event => event.type === 'cell_voltage_spec' && event.cells.some(cell => cell.voltage === 65024)));
});

test('normal charging fan-out is not reported as a bad-cell anomaly', () => {
  const timestamps = ['00:00:00', '00:00:10', '00:00:20'];
  const voltageRows = timestamps.map(time => {
    const row = { Time: `2026/1/1 ${time}`, 'Pack volt.(V)': '80', 'Current(A)': '-40' };
    for (let cell = 0; cell < 16; cell += 1) row[`Cell volt.N+${cell}(mV)`] = cell === 15 ? '3430' : '3300';
    return row;
  });
  const stateRows = timestamps.map(time => ({
    Time: `2026/1/1 ${time}`,
    'System state': 'Charging',
    'Shown SOC': '70'
  }));

  const result = processData({ 'Voltages 0x9A': voltageRows, 'System State 0x93': stateRows });
  assert.ok(result.timeSeries.every(sample => sample.operatingState?.startsWith('CHARGING')));
  assert.ok(!result.anomalies.some(event => event.type === 'voltage_outlier'));
  assert.ok(!result.anomalies.some(event => event.type === 'cell_imbalance'));
});

test('native alarm severity transitions stay in one fault lifecycle', () => {
  const result = processData({
    'Voltages 0x9A': [
      { Time: '2026/1/1 00:00:00', 'Pack volt.(V)': '80', 'Current(A)': '0', 'Cell volt.N+0(mV)': '3300' },
      { Time: '2026/1/1 00:00:10', 'Pack volt.(V)': '80', 'Current(A)': '0', 'Cell volt.N+0(mV)': '3300' },
      { Time: '2026/1/1 00:00:20', 'Pack volt.(V)': '80', 'Current(A)': '0', 'Cell volt.N+0(mV)': '3300' }
    ],
    'Alarm 0x87': [
      { Time: '2026/1/1 00:00:00', LowSoc: 'Lvl 1 Alarm' },
      { Time: '2026/1/1 00:00:10', LowSoc: 'Lvl 2 Alarm' },
      { Time: '2026/1/1 00:00:20', LowSoc: 'No Alarm' }
    ]
  });

  assert.equal(result.faultEvents.length, 1);
  assert.equal(result.faultEvents[0].severity, 2);
  assert.deepEqual(result.faultEvents[0].transitions.map(({ from, to }) => ({ from, to })), [{ from: 1, to: 2 }]);
  assert.equal(result.faultEvents[0].duration, 20 / 60);
});
