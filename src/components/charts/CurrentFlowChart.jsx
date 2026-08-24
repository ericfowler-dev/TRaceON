import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, ReferenceLine
} from 'recharts';
import { Waves } from 'lucide-react';

const formatTimestamp = (timestamp) => new Date(timestamp).toLocaleString('en-US', {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
});

const CurrentTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const current = payload.find(item => item.dataKey === 'current')?.value;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 shadow-xl">
      <div className="mb-1 text-xs text-slate-400">{formatTimestamp(label)}</div>
      <div className={`font-mono text-sm font-semibold ${current > 0 ? 'text-emerald-300' : current < 0 ? 'text-cyan-300' : 'text-slate-300'}`}>
        {current == null ? 'No current data' : `${current.toFixed(1)} A · ${current > 0 ? 'Charging' : current < 0 ? 'Discharging' : 'Idle'}`}
      </div>
    </div>
  );
};

const CurrentFlowChart = ({ data, gaps = [], switchMarkers = [] }) => {
  const currentData = useMemo(() => {
    return data
      .filter(sample => Number.isFinite(sample.ts) && (Number.isFinite(sample.current) || sample.isDataGap))
      .map(sample => ({ ts: sample.ts, current: sample.current ?? null, isDataGap: sample.isDataGap }));
  }, [data]);
  if (currentData.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 md:col-span-2">
      <div className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-300">
        <Waves className="h-4 w-4 text-cyan-400" /> Current &amp; Power Flow
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={currentData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="currentFlowFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
            </linearGradient>
            <pattern id="currentGapPattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="8" fill="#f59e0b" fillOpacity="0.08" />
            </pattern>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            domain={['dataMin', 'dataMax']}
            stroke="#64748b"
            fontSize={10}
            tickFormatter={formatTimestamp}
          />
          <YAxis stroke="#64748b" fontSize={11} tickFormatter={value => `${value}A`} />
          <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
          {gaps.map(gap => (
            <ReferenceArea
              key={gap.id}
              x1={gap.startTs}
              x2={gap.endTs}
              fill="url(#currentGapPattern)"
              stroke="#f59e0b"
              strokeOpacity={0.3}
              strokeDasharray="4 4"
            />
          ))}
          {switchMarkers.map(marker => (
            <ReferenceLine
              key={`${marker.type}-${marker.ts}`}
              x={marker.ts}
              stroke={marker.color}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              label={{ value: marker.label, position: 'insideTop', fill: marker.color, fontSize: 9 }}
            />
          ))}
          <Tooltip content={<CurrentTooltip />} isAnimationActive={false} />
          <Area
            type="monotone"
            dataKey="current"
            name="Current (A)"
            stroke="#06b6d4"
            strokeWidth={2}
            fill="url(#currentFlowFill)"
            connectNulls={false}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-2 flex gap-5 text-xs text-slate-500">
        <span><span className="text-emerald-400">▲</span> Positive: charging</span>
        <span><span className="text-cyan-400">▼</span> Negative: discharging</span>
      </div>
    </div>
  );
};

export default CurrentFlowChart;
