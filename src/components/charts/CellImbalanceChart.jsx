import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { classifyCellImbalance, getCellBalanceThresholds } from '../../lib/anomalyDetection';

const ChartCard = ({ title, icon, children }) => (
  <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
    <div className="flex items-center gap-2 mb-4 text-base font-semibold text-slate-300">
      {icon} {title}
    </div>
    {children}
  </div>
);

const CellImbalanceTooltip = ({ active, payload, faultEvents, faultMarkers = [], relayConfig = {}, sensitivityPreset = 'balanced' }) => {
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
        const faultStart = f.startTime || f.time;
        if (!faultStart || typeof faultStart.getTime !== 'function') return false;
        const startTs = faultStart.getTime();
        const endTs = (f.endTime && typeof f.endTime.getTime === 'function') ? f.endTime.getTime() : Number.POSITIVE_INFINITY;
        return ts >= startTs && ts <= endTs;
      });
    }
  }

  const severity = classifyCellImbalance(value, data.operatingState, sensitivityPreset);
  const thresholds = getCellBalanceThresholds(data.operatingState, sensitivityPreset);
  const activeCurrent = data.operatingState?.startsWith('CHARGING') || data.operatingState?.startsWith('DISCHARGING');
  const statusColor = severity === 3 ? '#ef4444' : severity === 2 ? '#f97316' : severity === 1 ? '#f59e0b' : '#10b981';
  const statusText = severity === 3
    ? 'CRITICAL'
    : severity === 2
      ? 'WARNING'
      : severity === 1
        ? 'MONITOR'
        : activeCurrent
          ? 'NORMAL ACTIVE SPREAD'
          : data.operatingState === 'REST_PENDING'
            ? 'SETTLING'
            : 'GOOD';

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
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-500">Analysis context:</span>
          <span className="font-mono text-slate-300">{data.operatingState || 'UNKNOWN'} · critical &gt;{thresholds.critical}mV</span>
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

const CellImbalanceChart = ({ data, faultEvents = [], faultMarkers = [], relayConfig = {}, sensitivityPreset = 'balanced' }) => {
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

          {/* Settled-rest references only; active-current limits are state-aware. */}
          <ReferenceLine y={20} label={{ position: 'right', value: 'Rest monitor 20mV', fill: '#f59e0b', fontSize: 10 }} stroke="#f59e0b" strokeDasharray="3 3" opacity={0.5} />
          <ReferenceLine y={35} label={{ position: 'right', value: 'Rest warning 35mV', fill: '#f97316', fontSize: 10 }} stroke="#f97316" strokeDasharray="3 3" opacity={0.65} />
          <ReferenceLine y={50} label={{ position: 'right', value: 'Rest critical >50mV', fill: '#ef4444', fontSize: 10 }} stroke="#ef4444" strokeDasharray="3 3" opacity={0.8} />

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
            content={<CellImbalanceTooltip faultEvents={faultEvents} faultMarkers={faultMarkers} relayConfig={relayConfig} sensitivityPreset={sensitivityPreset} />}
          />
          {/* Main line */}
          <Line
            type="monotone"
            dataKey="cellDiff"
            stroke="#06b6d4"
            strokeWidth={3}
            dot={false}
            name="Δ mV (Max-Min)"
            connectNulls
            isAnimationActive={false}
            activeDot={{ r: 20, fill: '#06b6d4', opacity: 0.3 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[11px] text-slate-500">
        Reference lines apply only after 15 minutes of settled rest. Hover a sample for its operating-state threshold; active-current spread is not colored as a fault unless it exceeds the extreme guard.
      </p>
    </ChartCard>
  );
};

export default CellImbalanceChart;
