import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { AlertTriangle, CheckCircle } from 'lucide-react';

const ChartCard = ({ title, icon, children }) => (
  <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
    <div className="flex items-center gap-2 mb-4 text-base font-semibold text-slate-300">
      {icon} {title}
    </div>
    {children}
  </div>
);

const CellImbalanceTooltip = ({ active, payload, faultEvents, faultMarkers = [], relayConfig = {} }) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const value = data.cellDiff;

  // Find fault markers at this time point
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

  // Find active faults at this timestamp - with defensive checks
  let activeFaults = [];
  if (data.fullTime && faultEvents && faultEvents.length > 0) {
    const fullTimeDate = new Date(data.fullTime);
    if (!isNaN(fullTimeDate.getTime())) {
      const ts = fullTimeDate.getTime();
      activeFaults = faultEvents.filter(f => {
        if (!f.startTime || typeof f.startTime.getTime !== 'function') return false;
        const startTs = f.startTime.getTime();
        const endTs = (f.endTime && typeof f.endTime.getTime === 'function') ? f.endTime.getTime() : Date.now();
        return ts >= startTs && ts <= endTs;
      });
    }
  }

  let statusColor = '#10b981';
  let statusText = 'GOOD';
  if (value >= 150) {
    statusColor = '#ef4444';
    statusText = 'BAD';
  } else if (value >= 30) {
    statusColor = '#f59e0b';
    statusText = 'Monitor';
  }

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 shadow-xl">
      <div className="text-xs text-slate-400 mb-2">{data.time}</div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-300">Δ mV:</span>
          <span className="font-bold" style={{ color: statusColor }}>
            {value}mV ({statusText})
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-300">Status:</span>
          <span className={`font-semibold ${
            data.systemState === 'Charging' ? 'text-emerald-400' :
            data.systemState === 'Discharging' ? 'text-cyan-400' : 'text-slate-400'
          }`}>
            {data.systemState || 'Standby'}
          </span>
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
        {activeFaults.length > 0 && (
          <div className="border-t border-slate-700 pt-2 mt-2">
            <div className="text-xs text-red-400 font-semibold mb-1">Active Faults:</div>
            <div className="space-y-0.5">
              {activeFaults.slice(0, 3).map((f, i) => (
                <div key={i} className="text-xs text-red-300">
                  • {getEnhancedName(f)} (Lvl {f.severity})
                </div>
              ))}
              {activeFaults.length > 3 && (
                <div className="text-xs text-red-400">
                  +{activeFaults.length - 3} more
                </div>
              )}
            </div>
          </div>
        )}
        {activeFaults.length === 0 && faultsAtTime.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle className="w-3 h-3" />
            <span>No Active Faults</span>
          </div>
        )}
      </div>
    </div>
  );
};

const CellImbalanceChart = ({ data, faultEvents = [], faultMarkers = [], relayConfig = {} }) => {
  if (!data || data.length === 0) {
    return (
      <ChartCard title="Cell Imbalance (Δ) - Balance Health Monitor" icon={<AlertTriangle className="w-4 h-4 text-red-400" />}>
        <div className="h-56 flex items-center justify-center text-slate-500">
          No data available
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Cell Imbalance (Δ) - Balance Health Monitor" icon={<AlertTriangle className="w-4 h-4 text-red-400" />}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="time" stroke="#475569" fontSize={11} tick={{fill: '#475569'}} />
          <YAxis stroke="#475569" fontSize={11} tickFormatter={(val) => `${val}mV`} />

          {/* GOOD threshold: <30mV (GREEN) */}
          <ReferenceLine y={30} label={{ position: 'right', value: 'Good <30mV', fill: '#10b981', fontSize: 10 }} stroke="#10b981" strokeDasharray="3 3" opacity={0.5} />
          {/* MARGINAL threshold: 30-150mV (YELLOW) */}
          <ReferenceLine y={150} label={{ position: 'right', value: 'Warning 150mV', fill: '#f59e0b', fontSize: 10 }} stroke="#f59e0b" strokeDasharray="3 3" />

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
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: '12px' }}
            cursor={{ stroke: '#06b6d4', strokeWidth: 2, strokeDasharray: '5 5' }}
            wrapperStyle={{ zIndex: 1000 }}
            allowEscapeViewBox={{ x: true, y: true }}
            content={<CellImbalanceTooltip faultEvents={faultEvents} faultMarkers={faultMarkers} relayConfig={relayConfig} />}
          />
          {/* Main line */}
          <Line
            type="monotone"
            dataKey="cellDiff"
            stroke="#10b981"
            strokeWidth={3}
            dot={false}
            name="Δ mV (Max-Min)"
            connectNulls
            isAnimationActive={false}
            activeDot={{ r: 20, fill: '#10b981', opacity: 0.3 }}
          />
          {/* Overlay data with conditional colors - this creates the effect */}
          {data.map((d, i) => {
            if (!d.cellDiff) return null;
            let color = '#10b981'; // Green (GOOD)
            if (d.cellDiff >= 150) color = '#ef4444'; // Red (BAD)
            else if (d.cellDiff >= 30) color = '#f59e0b'; // Yellow (MARGINAL)

            return (
              <Line
                key={`segment-${i}`}
                data={[d]}
                type="monotone"
                dataKey="cellDiff"
                stroke={color}
                strokeWidth={3}
                dot={false}
                connectNulls
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

export default CellImbalanceChart;
