import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { Activity } from 'lucide-react';
import { iterativeMergeSort } from '../../lib/parsers';

const ChartCard = ({ title, icon, children }) => (
  <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
    <div className="flex items-center gap-2 mb-4 text-base font-semibold text-slate-300">
      {icon} {title}
    </div>
    {children}
  </div>
);

const CellVoltageTooltip = ({ active, payload, cellCount }) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;

  const cellVoltages = [];
  for (let i = 0; i < (cellCount || 0); i++) {
    const cellKey = `cell${i}`;
    if (data[cellKey] != null) {
      cellVoltages.push({ cell: i + 1, voltage: data[cellKey] });
    }
  }

  const sortedCellVoltages = iterativeMergeSort(cellVoltages, (a, b) => b.voltage - a.voltage);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 shadow-xl max-w-xs">
      <div className="text-xs text-slate-400 mb-2 font-semibold">{data.time}</div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4 border-b border-slate-700 pb-1.5">
          <span className="text-emerald-400 font-semibold">Pack Max:</span>
          <span className="text-emerald-400 font-bold">{data.maxCell}mV</span>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-slate-700 pb-1.5">
          <span className="text-blue-400 font-semibold">Pack Min:</span>
          <span className="text-blue-400 font-bold">{data.minCell}mV</span>
        </div>

        {sortedCellVoltages.length > 10 ? (
          <>
            <div className="text-xs text-slate-500 mt-2 mb-1">Highest 5 Cells:</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
              {sortedCellVoltages.slice(0, 5).map(({ cell, voltage }) => (
                <div key={cell} className="flex justify-between">
                  <span className="text-slate-400">Cell #{cell}:</span>
                  <span className="text-white font-mono">{voltage}mV</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-500 mt-2 mb-1">Lowest 5 Cells:</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
              {sortedCellVoltages.slice(-5).reverse().map(({ cell, voltage }) => (
                <div key={cell} className="flex justify-between">
                  <span className="text-slate-400">Cell #{cell}:</span>
                  <span className="text-white font-mono">{voltage}mV</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs mt-2">
            {sortedCellVoltages.map(({ cell, voltage }) => (
              <div key={cell} className="flex justify-between">
                <span className="text-slate-400">Cell #{cell}:</span>
                <span className="text-white font-mono">{voltage}mV</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const CellVoltageChart = ({ data, cellCount, dateChangeMarkers = [] }) => {
  if (!data || data.length === 0) {
    return (
      <ChartCard title={`Cell Voltage Precision (${cellCount || 0} cells)`} icon={<Activity className="w-4 h-4 text-cyan-400" />}>
        <div className="h-96 flex items-center justify-center text-slate-500">
          No data available
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title={`Cell Voltage Precision (${cellCount || 0} cells)`} icon={<Activity className="w-4 h-4 text-cyan-400" />}>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
              <feOffset dx="0" dy="0" result="offsetblur"/>
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.8"/>
              </feComponentTransfer>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="time" stroke="#475569" fontSize={11} tick={{fill: '#475569'}} />
          <YAxis
            domain={['dataMin - 50', 'dataMax + 50']}
            stroke="#475569"
            fontSize={11}
            tickFormatter={(val) => `${val}mV`}
          />

          <ReferenceLine y={4200} label={{ position: 'right', value: 'OV', fill: '#ef4444', fontSize: 11 }} stroke="#ef4444" strokeDasharray="5 5" />
          <ReferenceLine y={2800} label={{ position: 'right', value: 'UV', fill: '#ef4444', fontSize: 11 }} stroke="#ef4444" strokeDasharray="5 5" />

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
            shared={true}
            isAnimationActive={false}
            animationDuration={0}
            allowEscapeViewBox={{ x: true, y: true }}
            cursor={{ stroke: '#06b6d4', strokeWidth: 2, strokeDasharray: '5 5' }}
            wrapperStyle={{ zIndex: 1000 }}
            content={<CellVoltageTooltip cellCount={cellCount} />}
          />

          <Line
            type="monotone"
            dataKey="maxCell"
            stroke="#10b981"
            strokeWidth={3}
            dot={false}
            name="Pack Max"
            connectNulls
            isAnimationActive={false}
            activeDot={{ r: 20, fill: '#10b981', opacity: 0.3 }}
          />
          <Line
            type="monotone"
            dataKey="minCell"
            stroke="#3b82f6"
            strokeWidth={3}
            dot={false}
            name="Pack Min"
            connectNulls
            isAnimationActive={false}
            activeDot={{ r: 20, fill: '#3b82f6', opacity: 0.3 }}
          />

          {Array.from({ length: cellCount || 0 }, (_, i) => (
            <Line
              key={i}
              type="monotone"
              dataKey={`cell${i}`}
              stroke={`hsl(${i * (360 / (cellCount || 1))}, 70%, 60%)`}
              dot={false}
              strokeWidth={1.2}
              opacity={0.6}
              connectNulls
              activeDot={false}
              name={`Cell #${i+1}`}
              isAnimationActive={false}
              legendType="none"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default CellVoltageChart;
