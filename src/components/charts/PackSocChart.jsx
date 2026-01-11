import React from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { TrendingUp } from 'lucide-react';

const ChartCard = ({ title, icon, children }) => (
  <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
    <div className="flex items-center gap-2 mb-4 text-base font-semibold text-slate-300">
      {icon} {title}
    </div>
    {children}
  </div>
);

const PackSocChart = ({ data, dateChangeMarkers = [] }) => {
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
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="time" stroke="#475569" fontSize={11} tick={{fill: '#475569'}} />
          <YAxis yAxisId="l" stroke="#10b981" fontSize={11} tickFormatter={(val) => `${val}V`} />
          <YAxis yAxisId="r" orientation="right" stroke="#8b5cf6" fontSize={11} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />

          {/* SOC reference lines */}
          <ReferenceLine yAxisId="r" y={20} label={{ position: 'right', value: 'Low', fill: '#f59e0b', fontSize: 10 }} stroke="#f59e0b" strokeDasharray="3 3" />
          <ReferenceLine yAxisId="r" y={80} label={{ position: 'right', value: 'High', fill: '#10b981', fontSize: 10 }} stroke="#10b981" strokeDasharray="3 3" />

          {/* Date change markers */}
          {dateChangeMarkers.map((marker, idx) => (
            <ReferenceLine
              key={`date-${idx}`}
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

          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: '12px' }}
            cursor={{ stroke: '#475569', strokeWidth: 1 }}
            wrapperStyle={{ zIndex: 1000 }}
            allowEscapeViewBox={{ x: true, y: true }}
            isAnimationActive={false}
            animationDuration={0}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line yAxisId="l" type="monotone" dataKey="packV" stroke="#10b981" dot={false} strokeWidth={2} name="Pack V" isAnimationActive={false} />
          <Line yAxisId="r" type="monotone" dataKey="soc" stroke="#8b5cf6" dot={false} strokeWidth={2} name="SOC %" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default PackSocChart;
