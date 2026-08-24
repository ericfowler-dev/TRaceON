import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea
} from 'recharts';
import { KeyRound, Moon, RadioTower } from 'lucide-react';
import { fmtDuration } from '../../lib/parsers';
import {
  buildSwitchTimelineData,
  formatSwitchState,
  getSwitchStateStyle,
  normalizeBinaryState
} from '../../lib/visualization';

const formatTimestamp = (timestamp, spanMs) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', spanMs > 24 * 60 * 60 * 1000
    ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' });
};

const buildGradientStops = (samples, switchId, onColor) => {
  const readings = samples
    .map(sample => ({ ts: sample.ts, value: normalizeBinaryState(sample[switchId]) }))
    .filter(reading => Number.isFinite(reading.ts) && reading.value != null);
  if (readings.length === 0) return [{ offset: 0, color: '#64748b' }, { offset: 100, color: '#64748b' }];

  const startTs = readings[0].ts;
  const endTs = readings.at(-1).ts;
  const span = Math.max(1, endTs - startTs);
  const colorFor = value => value === 1 ? onColor : '#64748b';
  const stops = [{ offset: 0, color: colorFor(readings[0].value) }];
  let previous = readings[0].value;

  for (let i = 1; i < readings.length; i++) {
    if (readings[i].value === previous) continue;
    const offset = ((readings[i].ts - startTs) / span) * 100;
    stops.push({ offset, color: colorFor(previous) });
    stops.push({ offset, color: colorFor(readings[i].value) });
    previous = readings[i].value;
  }
  stops.push({ offset: 100, color: colorFor(previous) });
  return stops;
};

const SwitchBadge = ({ switchId, value }) => (
  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getSwitchStateStyle(switchId, value)}`}>
    {formatSwitchState(switchId, value)}
  </span>
);

const TimelineTooltip = ({ active, payload, label, spanMs }) => {
  if (!active) return null;
  const point = payload?.find(entry => entry?.payload)?.payload;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 shadow-xl">
      <div className="mb-2 text-xs font-semibold text-slate-400">{formatTimestamp(label, spanMs)}</div>
      {point?.isGap ? (
        <div className="text-sm text-amber-300">No data logged</div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-slate-400">SW1 (Key)</span>
            <SwitchBadge switchId="sw1" value={point?.sw1} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-slate-400">SW2 (Start)</span>
            <SwitchBadge switchId="sw2" value={point?.sw2} />
          </div>
        </div>
      )}
    </div>
  );
};

const KeySwitchTimeline = ({ data, gaps = [] }) => {
  const timelineData = useMemo(() => buildSwitchTimelineData(data), [data]);
  const stateSamples = useMemo(() => data.filter(sample => (
    normalizeBinaryState(sample.sw1) != null || normalizeBinaryState(sample.sw2) != null
  )), [data]);
  const lastState = stateSamples.at(-1);
  const startTs = timelineData[0]?.ts;
  const endTs = timelineData.at(-1)?.ts;
  const spanMs = Number.isFinite(startTs) && Number.isFinite(endTs) ? endTs - startTs : 0;
  const sw1Stops = useMemo(() => buildGradientStops(stateSamples, 'sw1', '#22c55e'), [stateSamples]);
  const sw2Stops = useMemo(() => buildGradientStops(stateSamples, 'sw2', '#f59e0b'), [stateSamples]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 md:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-base font-semibold text-slate-300">
          <KeyRound className="h-4 w-4 text-emerald-400" /> Key Switch State
        </div>
        {lastState && (
          <div className="flex flex-wrap gap-2">
            <SwitchBadge switchId="sw1" value={lastState.sw1} />
            <SwitchBadge switchId="sw2" value={lastState.sw2} />
          </div>
        )}
      </div>

      {timelineData.length > 0 ? (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={timelineData} margin={{ top: 20, right: 24, left: 30, bottom: 5 }}>
            <defs>
              <linearGradient id="sw1StateStroke" x1="0" y1="0" x2="1" y2="0">
                {sw1Stops.map((stop, index) => <stop key={index} offset={`${stop.offset}%`} stopColor={stop.color} />)}
              </linearGradient>
              <linearGradient id="sw2StateStroke" x1="0" y1="0" x2="1" y2="0">
                {sw2Stops.map((stop, index) => <stop key={index} offset={`${stop.offset}%`} stopColor={stop.color} />)}
              </linearGradient>
              <pattern id="switchGapPattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="4" height="8" fill="#f59e0b" fillOpacity="0.08" />
              </pattern>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={['dataMin', 'dataMax']}
              stroke="#64748b"
              fontSize={11}
              tickFormatter={value => formatTimestamp(value, spanMs)}
            />
            <YAxis
              type="number"
              domain={[-0.2, 3.2]}
              ticks={[0, 1, 2, 3]}
              width={92}
              stroke="#64748b"
              fontSize={10}
              tickFormatter={value => ({ 0: 'KEY OFF', 1: 'KEY ON', 2: 'START OFF', 3: 'ENGAGED' })[value] || ''}
            />
            {gaps.map(gap => (
              <ReferenceArea
                key={gap.id}
                x1={gap.startTs}
                x2={gap.endTs}
                fill="url(#switchGapPattern)"
                stroke="#f59e0b"
                strokeOpacity={0.35}
                strokeDasharray="4 4"
              />
            ))}
            <Tooltip
              cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
              content={<TimelineTooltip spanMs={spanMs} />}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="sw1Lane"
              name="SW1 (Key)"
              stroke="url(#sw1StateStroke)"
              strokeWidth={3}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="sw2Lane"
              name="SW2 (Start)"
              stroke="url(#sw2StateStroke)"
              strokeWidth={3}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-48 items-center justify-center text-sm text-slate-500">
          No SW1/SW2 telemetry is available in this log.
        </div>
      )}

      {gaps.length > 0 && (
        <div className="mt-3 border-t border-slate-800 pt-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-300">
            <Moon className="h-4 w-4" /> Data gaps over 10 minutes ({gaps.length})
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {gaps.slice(0, 6).map(gap => (
              <div key={gap.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-amber-200">{fmtDuration(gap.durationMinutes)} without data</span>
                  <span className="text-slate-500">
                    {new Date(gap.startTs).toLocaleString()} → {new Date(gap.endTs).toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 flex items-start gap-2 text-slate-400">
                  <RadioTower className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span>{gap.reason}. Before: {gap.before.systemState}, {gap.before.sw1}. After: {gap.after.systemState}, {gap.after.sw1}.</span>
                </div>
              </div>
            ))}
          </div>
          {gaps.length > 6 && <div className="mt-2 text-xs text-slate-500">Showing the first 6 of {gaps.length} gaps.</div>}
        </div>
      )}
    </div>
  );
};

export default KeySwitchTimeline;

