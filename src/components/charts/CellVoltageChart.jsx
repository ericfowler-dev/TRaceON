import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { Activity, AlertTriangle } from 'lucide-react';
import { iterativeMergeSort } from '../../lib/parsers';

const ChartCard = ({ title, icon, children }) => (
  <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
    <div className="flex items-center gap-2 mb-4 text-base font-semibold text-slate-300">
      {icon} {title}
    </div>
    {children}
  </div>
);

const CellVoltageTooltip = ({ active, payload, cellCount, cellIndexStart = 0, faultMarkers = [], relayConfig = {} }) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;

  // Find faults at this time point
  const faultsAtTime = faultMarkers.filter(m => m.time === data.time);

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

  const cellVoltages = [];
  if (cellCount && cellCount > 0) {
    for (let i = 0; i < cellCount; i++) {
      const cellIndex = cellIndexStart + i;
      const cellKey = `cell${cellIndex}`;
      if (data[cellKey] != null) {
        const displayIndex = cellIndexStart === 0 ? i + 1 : cellIndex;
        cellVoltages.push({ cell: displayIndex, voltage: data[cellKey] });
      }
    }
  } else {
    const keys = Object.keys(data).filter(k => k.startsWith('cell'));
    let minIndex = null;
    for (let i = 0; i < keys.length; i++) {
      const idx = parseInt(keys[i].slice(4), 10);
      if (!Number.isNaN(idx)) {
        if (minIndex === null || idx < minIndex) minIndex = idx;
      }
    }
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const idx = parseInt(key.slice(4), 10);
      if (Number.isNaN(idx)) continue;
      const value = data[key];
      if (value != null) {
        const displayIndex = minIndex === 0 ? idx + 1 : idx;
        cellVoltages.push({ cell: displayIndex, voltage: value });
      }
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

const CellVoltageChart = ({ data, cellCount, cellIndexStart = 0, dateChangeMarkers = [], faultMarkers = [], relayConfig = {} }) => {
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

          {/* Fault markers - solid line for start, dashed for end */}
          {faultMarkers.map((marker, idx) => (
            <ReferenceLine
              key={`fault-${idx}`}
              x={marker.time}
              stroke={marker.color}
              strokeWidth={2}
              strokeDasharray={marker.type === 'end' ? '4 4' : 'none'}
            />
          ))}

          <Tooltip
            shared={true}
            isAnimationActive={false}
            animationDuration={0}
            allowEscapeViewBox={{ x: true, y: true }}
            cursor={{ stroke: '#06b6d4', strokeWidth: 2, strokeDasharray: '5 5' }}
            wrapperStyle={{ zIndex: 1000 }}
            content={<CellVoltageTooltip cellCount={cellCount} cellIndexStart={cellIndexStart} faultMarkers={faultMarkers} relayConfig={relayConfig} />}
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

          {Array.from({ length: cellCount || 0 }, (_, i) => {
            const cellIndex = cellIndexStart + i;
            const displayIndex = cellIndexStart === 0 ? i + 1 : cellIndex;
            return (
            <Line
              key={cellIndex}
              type="monotone"
              dataKey={`cell${cellIndex}`}
              stroke={`hsl(${i * (360 / (cellCount || 1))}, 70%, 60%)`}
              dot={false}
              strokeWidth={1.2}
              opacity={0.6}
              connectNulls
              activeDot={false}
              name={`Cell #${displayIndex}`}
              isAnimationActive={false}
              legendType="none"
            />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default CellVoltageChart;
