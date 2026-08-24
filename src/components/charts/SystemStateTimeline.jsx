import React, { useMemo } from 'react';
import { Layers3 } from 'lucide-react';
import { DATA_GAP_THRESHOLD_MS } from '../../lib/visualization';

const stateStyle = (state) => {
  const normalized = String(state || '').toLowerCase();
  if (normalized.includes('charging')) return { color: '#22c55e', label: state || 'Charging' };
  if (normalized.includes('discharging')) return { color: '#06b6d4', label: state || 'Discharging' };
  if (normalized.includes('sleep')) return { color: '#475569', label: state || 'Sleep' };
  if (normalized.includes('standby')) return { color: '#8b5cf6', label: state || 'Standby' };
  if (normalized.includes('rest')) return { color: '#3b82f6', label: state || 'Rest' };
  return { color: '#f59e0b', label: state || 'Unknown' };
};

const buildSegments = (data) => {
  const readings = data.filter(sample => Number.isFinite(sample.ts) && sample.systemState);
  if (readings.length === 0) return [];
  if (readings.length === 1) return [{ startTs: readings[0].ts, endTs: readings[0].ts + 1, state: readings[0].systemState }];

  const segments = [];
  let segmentStart = readings[0].ts;
  let state = readings[0].systemState;

  for (let i = 1; i < readings.length; i++) {
    const previous = readings[i - 1];
    const current = readings[i];
    const hasGap = current.ts - previous.ts > DATA_GAP_THRESHOLD_MS;
    const stateChanged = current.systemState !== state;

    if (hasGap || stateChanged) {
      segments.push({ startTs: segmentStart, endTs: hasGap ? previous.ts : current.ts, state });
      if (hasGap) segments.push({ startTs: previous.ts, endTs: current.ts, state: null, isGap: true });
      segmentStart = current.ts;
      state = current.systemState;
    }
  }

  segments.push({ startTs: segmentStart, endTs: readings.at(-1).ts, state });
  return segments;
};

const SystemStateTimeline = ({ data }) => {
  const segments = useMemo(() => buildSegments(data), [data]);
  const startTs = segments[0]?.startTs;
  const endTs = segments.at(-1)?.endTs;
  const span = Math.max(1, (endTs || 0) - (startTs || 0));
  const legend = useMemo(() => {
    const byState = new Map();
    for (const segment of segments) {
      if (!segment.state) continue;
      if (!byState.has(segment.state)) byState.set(segment.state, stateStyle(segment.state));
    }
    return [...byState.values()];
  }, [segments]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 md:col-span-2">
      <div className="flex items-center gap-2 text-base font-semibold text-slate-300">
        <Layers3 className="h-4 w-4 text-violet-400" /> System State
      </div>
      {segments.length > 0 ? (
        <>
          <div className="mt-5 flex h-16 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
            {segments.map((segment, index) => {
              const width = Math.max(0.15, ((segment.endTs - segment.startTs) / span) * 100);
              const style = stateStyle(segment.state);
              const title = segment.isGap
                ? `DATA GAP: ${new Date(segment.startTs).toLocaleString()} to ${new Date(segment.endTs).toLocaleString()}`
                : `${style.label}: ${new Date(segment.startTs).toLocaleString()} to ${new Date(segment.endTs).toLocaleString()}`;
              return (
                <div
                  key={`${segment.startTs}-${index}`}
                  title={title}
                  className={`relative h-full border-r border-slate-950/60 ${segment.isGap ? 'state-gap-pattern' : ''}`}
                  style={{ width: `${width}%`, backgroundColor: segment.isGap ? undefined : style.color }}
                >
                  {!segment.isGap && width > 8 && (
                    <span className="absolute inset-0 flex items-center justify-center truncate px-2 text-[10px] font-bold uppercase tracking-wide text-slate-950/80">
                      {style.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-500">
            <span>{new Date(startTs).toLocaleString()}</span>
            <span>{new Date(endTs).toLocaleString()}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
            {legend.map(item => (
              <span key={item.label} className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} /> {item.label}
              </span>
            ))}
            {segments.some(segment => segment.isGap) && (
              <span className="inline-flex items-center gap-2">
                <span className="state-gap-pattern h-2.5 w-2.5 rounded-sm" /> Data gap
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="flex h-28 items-center justify-center text-sm text-slate-500">
          No system-state telemetry is available in this log.
        </div>
      )}
    </div>
  );
};

export default SystemStateTimeline;
