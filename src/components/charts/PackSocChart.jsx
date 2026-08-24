import React from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceArea, ReferenceLine
} from 'recharts';
import { TrendingUp, AlertTriangle } from 'lucide-react';

const ChartCard = ({ title, icon, children }) => (
  <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
    <div className="flex items-center gap-2 mb-4 text-base font-semibold text-slate-300">
      {icon} {title}
    </div>
    {children}
  </div>
);

const PackSocTooltip = ({ active, payload, faultMarkers, keySwitchMarkers = [], relayConfig = {} }) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;

  // Find faults at this time point
  const faultsAtTime = faultMarkers.filter(m => m.time === data.time);
  const switchEventsAtTime = keySwitchMarkers.filter(marker => marker.chartTime === data.time);

  // Helper to get enhanced fault name with actual relay names
  const getEnhancedName = (fault) => {
    if (fault.code === 'RlyFault' && fault.stickingRelays && fault.stickingRelays.length > 0) {
      const relayNames = fault.stickingRelays
        .map(relayId => relayConfig[relayId] || relayId)
        .join(', ');
      return `Relay Fault (${relayNames} Sticking)`;
    }
    return fault.name;
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 shadow-xl">
      <div className="text-xs text-slate-400 mb-2 font-semibold">{data.time}</div>
      <div className="space-y-1.5">
        {data.packV != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-emerald-400">Pack V:</span>
            <span className="text-emerald-400 font-bold">{data.packV}V</span>
          </div>
        )}
        {data.soc != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-violet-400">SOC:</span>
            <span className="text-violet-400 font-bold">{data.soc}%</span>
          </div>
        )}
        {switchEventsAtTime.length > 0 && (
          <div className="border-t border-slate-700 pt-2 mt-2 space-y-1">
            {switchEventsAtTime.map(marker => (
              <div key={`${marker.type}-${marker.ts}`} className="text-xs font-semibold" style={{ color: marker.color }}>
                {marker.label}
              </div>
            ))}
          </div>
        )}
        {faultsAtTime.length > 0 && (
          <div className="border-t border-slate-700 pt-2 mt-2">
            <div className="flex items-center gap-1 text-xs font-semibold mb-1" style={{ color: faultsAtTime[0].color }}>
              <AlertTriangle className="w-3 h-3" />
              <span>Fault {faultsAtTime[0].type === 'start' ? 'Started' : 'Ended'}</span>
            </div>
            {faultsAtTime.map((f, i) => (
              <div key={i} className="text-sm" style={{ color: f.color }}>
                {getEnhancedName(f)} ({f.code})
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const PackSocChart = ({
  data,
  dateChangeMarkers = [],
  faultMarkers = [],
  keySwitchMarkers = [],
  dataGaps = [],
  relayConfig = {}
}) => {
  if (!data || data.length === 0) {
    return (
      <ChartCard title="Pack Voltage & State of Charge" icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}>
        <div className="h-80 flex items-center justify-center text-slate-500">
          No data available
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Pack Voltage & State of Charge" icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <pattern id="packSocGapPattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="8" fill="#f59e0b" fillOpacity="0.08" />
            </pattern>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="time" stroke="#475569" fontSize={11} tick={{fill: '#475569'}} />
          <YAxis yAxisId="l" stroke="#10b981" fontSize={11} tickFormatter={(val) => `${val}V`} />
          <YAxis yAxisId="r" orientation="right" stroke="#8b5cf6" fontSize={11} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />

          {/* SOC reference lines */}
          <ReferenceLine yAxisId="r" y={20} label={{ position: 'right', value: 'Low', fill: '#f59e0b', fontSize: 10 }} stroke="#f59e0b" strokeDasharray="3 3" />
          <ReferenceLine yAxisId="r" y={80} label={{ position: 'right', value: 'High', fill: '#10b981', fontSize: 10 }} stroke="#10b981" strokeDasharray="3 3" />

          {dataGaps.map(gap => (
            <ReferenceArea
              key={gap.id}
              yAxisId="l"
              x1={gap.startTime}
              x2={gap.endTime}
              fill="url(#packSocGapPattern)"
              stroke="#f59e0b"
              strokeOpacity={0.3}
              strokeDasharray="4 4"
            />
          ))}

          {/* Date change markers */}
          {dateChangeMarkers.map((marker, idx) => (
            <ReferenceLine
              key={`date-${idx}`}
              yAxisId="l"
              x={marker.time}
              stroke="#64748b"
              strokeWidth={2}
              strokeDasharray="5 5"
              label={{
                value: marker.label,
                position: 'top',
                fill: '#94a3b8',
                fontSize: 11,
                fontWeight: 'bold'
              }}
            />
          ))}

          {/* Fault markers - solid line for start, dashed for end */}
          {faultMarkers.map((marker, idx) => (
            <ReferenceLine
              key={`fault-${idx}`}
              yAxisId="l"
              x={marker.time}
              stroke={marker.color}
              strokeWidth={2}
              strokeDasharray={marker.type === 'end' ? '4 4' : 'none'}
            />
          ))}

          {keySwitchMarkers.map(marker => (
            <ReferenceLine
              key={`${marker.type}-${marker.ts}`}
              yAxisId="l"
              x={marker.chartTime}
              stroke={marker.color}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              label={{ value: marker.label, position: 'insideTop', fill: marker.color, fontSize: 9 }}
            />
          ))}

          <Tooltip
            cursor={{ stroke: '#475569', strokeWidth: 1 }}
            wrapperStyle={{ zIndex: 1000 }}
            allowEscapeViewBox={{ x: true, y: true }}
            isAnimationActive={false}
            animationDuration={0}
            content={<PackSocTooltip faultMarkers={faultMarkers} keySwitchMarkers={keySwitchMarkers} relayConfig={relayConfig} />}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line yAxisId="l" type="monotone" dataKey="packV" stroke="#10b981" dot={false} strokeWidth={2} name="Pack V" connectNulls={false} isAnimationActive={false} />
          <Line yAxisId="r" type="monotone" dataKey="soc" stroke="#8b5cf6" dot={false} strokeWidth={2} name="SOC %" connectNulls={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default PackSocChart;
