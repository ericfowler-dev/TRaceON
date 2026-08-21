import React, { useMemo } from 'react';
import { Activity, Battery, CheckCircle, Clock, Info, TriangleAlert } from 'lucide-react';
import { THRESHOLDS } from '../lib/thresholds';
import {
  classifyCellImbalance,
  getCellBalanceThresholds,
  OPERATING_STATES
} from '../lib/anomalyDetection';

const STATE_LABELS = {
  [OPERATING_STATES.REST]: 'Settled rest',
  [OPERATING_STATES.REST_PENDING]: 'Rest · settling',
  [OPERATING_STATES.CHARGING_CV]: 'Charging · CV',
  [OPERATING_STATES.CHARGING_CC_LOW]: 'Charging · CC low',
  [OPERATING_STATES.CHARGING_CC_HIGH]: 'Charging · CC high',
  [OPERATING_STATES.DISCHARGING_LOW]: 'Discharging · low load',
  [OPERATING_STATES.DISCHARGING_HIGH]: 'Discharging · high load',
  [OPERATING_STATES.BALANCING]: 'Active balancing',
  [OPERATING_STATES.UNKNOWN]: 'Unknown state'
};

const stateIsActive = (state) => state?.startsWith('CHARGING') || state?.startsWith('DISCHARGING');

const getAbsoluteStatus = (voltage) => {
  if (voltage < THRESHOLDS.cellVoltage.dischargeMin || voltage >= THRESHOLDS.cellVoltage.absoluteMax) {
    return { category: 'unsafe', label: 'Outside safe limits', dot: 'bg-red-500', border: 'border-red-500/80' };
  }
  if (voltage < THRESHOLDS.cellVoltage.level1Low || voltage > THRESHOLDS.cellVoltage.level2High) {
    return { category: 'advisory', label: 'Near operating limit', dot: 'bg-violet-400', border: 'border-violet-400/65' };
  }
  const label = voltage > THRESHOLDS.cellVoltage.nominal.max
    ? 'Upper operating range'
    : voltage < THRESHOLDS.cellVoltage.nominal.min
      ? 'Lower operating range'
      : 'Nominal';
  return { category: 'safe', label, dot: 'bg-[#39ff14]', border: 'border-[#39ff14]/40' };
};

const getRelativeStyle = (voltage, average, spread, significanceBoundary) => {
  const deviation = voltage - average;
  const neutralBand = Math.max(0.75, Math.min(3, spread * 0.12));
  const significance = significanceBoundary > 0 ? spread / significanceBoundary : 0;
  const quiet = significance < 0.25;
  const moderate = significance < 0.65;

  if (Math.abs(deviation) <= neutralBand) {
    return {
      bg: quiet ? 'bg-slate-800/65' : moderate ? 'bg-teal-950/65' : 'bg-teal-800/75',
      bar: 'bg-teal-300',
      direction: 'center',
      label: 'Near average'
    };
  }
  if (deviation < 0) {
    return {
      bg: quiet ? 'bg-cyan-950/45' : moderate ? 'bg-cyan-900/60' : 'bg-blue-700/75',
      bar: 'bg-cyan-400',
      direction: 'low',
      label: 'Below average'
    };
  }
  return {
    bg: quiet ? 'bg-green-950/45' : moderate ? 'bg-green-900/60' : 'bg-green-700/75',
    bar: 'bg-[#39ff14]',
    direction: 'high',
    label: 'Above average'
  };
};

const getBalanceAssessment = (spread, state, severity, thresholds) => {
  if (state === OPERATING_STATES.REST_PENDING) {
    return {
      icon: <Clock className="h-4 w-4" />,
      title: 'Waiting for settled-rest reading',
      detail: 'Balance diagnosis begins after current remains below 0.5 A for 15 continuous minutes.',
      style: 'border-cyan-500/30 bg-cyan-950/25 text-cyan-100'
    };
  }
  if (severity === 3) {
    return {
      icon: <TriangleAlert className="h-4 w-4" />,
      title: stateIsActive(state) ? 'Extreme active-current spread' : 'Critical rest imbalance',
      detail: stateIsActive(state)
        ? `${spread} mV exceeds the ${thresholds.critical} mV extreme guard. Inspect sensing, cells, and connections.`
        : `${spread} mV after settled rest exceeds the ${thresholds.critical} mV critical threshold.`,
      style: 'border-red-500/40 bg-red-950/30 text-red-100'
    };
  }
  if (severity === 2) {
    return {
      icon: <TriangleAlert className="h-4 w-4" />,
      title: 'Rest imbalance needs investigation',
      detail: `${spread} mV after settled rest is above the ${thresholds.warning} mV warning threshold.`,
      style: 'border-orange-500/40 bg-orange-950/25 text-orange-100'
    };
  }
  if (severity === 1) {
    return {
      icon: <Info className="h-4 w-4" />,
      title: 'Rest spread should be trended',
      detail: `${spread} mV is in the settled-rest monitoring band. Look for persistence across charge cycles.`,
      style: 'border-amber-500/35 bg-amber-950/20 text-amber-100'
    };
  }
  if (state?.startsWith('CHARGING')) {
    return {
      icon: <CheckCircle className="h-4 w-4" />,
      title: 'Normal charging response',
      detail: spread < 20
        ? `The cells are very tightly grouped at ${spread} mV spread while charging.`
        : `${spread} mV of charging fan-out is within the normal internal-resistance response range.`,
      style: 'border-emerald-500/30 bg-emerald-950/20 text-emerald-100'
    };
  }
  if (state?.startsWith('DISCHARGING')) {
    return {
      icon: <CheckCircle className="h-4 w-4" />,
      title: 'Balanced under load',
      detail: spread < 20
        ? `The cells are very tightly grouped at ${spread} mV spread under load.`
        : `${spread} mV is within the normal load-response range. True imbalance is evaluated after settled rest.`,
      style: 'border-emerald-500/30 bg-emerald-950/20 text-emerald-100'
    };
  }
  if (state === OPERATING_STATES.REST) {
    return {
      icon: <CheckCircle className="h-4 w-4" />,
      title: 'Balanced at settled rest',
      detail: `${spread} mV is below the ${thresholds.info} mV settled-rest monitoring threshold.`,
      style: 'border-emerald-500/30 bg-emerald-950/20 text-emerald-100'
    };
  }
  if (state === OPERATING_STATES.BALANCING) {
    return {
      icon: <Activity className="h-4 w-4" />,
      title: 'Active balancing in progress',
      detail: `${spread} mV is being actively equalized. Confirm final balance after 15 minutes of settled rest.`,
      style: 'border-[#39ff14]/30 bg-green-950/20 text-green-100'
    };
  }
  return {
    icon: <Info className="h-4 w-4" />,
    title: 'Balance context is limited',
    detail: `${spread} mV is shown for comparison. A diagnostic conclusion requires a known state and settled rest.`,
    style: 'border-slate-600 bg-slate-800/40 text-slate-200'
  };
};

const ReferenceCard = ({ label, value, detail, accent }) => (
  <div className={`rounded-lg border border-slate-700/70 border-l-2 ${accent} bg-slate-800/45 px-3 py-2.5`}>
    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-0.5 font-mono text-sm font-semibold text-white">{value}</div>
    <div className="mt-0.5 text-[10px] text-slate-500">{detail}</div>
  </div>
);

const CellVoltageHeatMaps = ({ snapshot, balanceAnalysis, sensitivityPreset = 'balanced' }) => {
  const stats = useMemo(() => {
    const cells = Object.entries(snapshot?.cells || {})
      .filter(([, voltage]) => Number.isFinite(voltage) && voltage >= 1000 && voltage <= THRESHOLDS.cellVoltage.sensorFault)
      .sort(([a], [b]) => Number(a) - Number(b));
    if (!cells.length) return { cells, min: null, max: null, average: null, spread: null };

    let minEntry = cells[0];
    let maxEntry = cells[0];
    let total = 0;
    let nominalCount = 0;
    let advisoryCount = 0;
    for (const entry of cells) {
      const voltage = entry[1];
      total += voltage;
      if (voltage < minEntry[1]) minEntry = entry;
      if (voltage > maxEntry[1]) maxEntry = entry;
      const status = getAbsoluteStatus(voltage).category;
      if (status === 'safe') nominalCount += 1;
      else if (status === 'advisory') advisoryCount += 1;
    }

    return {
      cells,
      min: minEntry[1],
      minCell: minEntry[0],
      max: maxEntry[1],
      maxCell: maxEntry[0],
      average: total / cells.length,
      spread: maxEntry[1] - minEntry[1],
      nominalCount,
      advisoryCount,
      unsafeCount: cells.length - nominalCount - advisoryCount
    };
  }, [snapshot]);

  if (!stats.cells.length) return null;

  const state = snapshot.operatingState || OPERATING_STATES.UNKNOWN;
  const thresholds = getCellBalanceThresholds(state, sensitivityPreset);
  const severity = classifyCellImbalance(stats.spread, state, sensitivityPreset);
  const assessment = getBalanceAssessment(stats.spread, state, severity, thresholds);
  const stateLabel = STATE_LABELS[state] || state;
  const significanceBoundary = state === OPERATING_STATES.REST ? thresholds.warning : thresholds.critical;
  const maxDeviation = Math.max(Math.abs(stats.min - stats.average), Math.abs(stats.max - stats.average), 1);
  const safetySummary = stats.unsafeCount > 0
    ? { text: `${stats.unsafeCount} outside safe limits`, style: 'border-red-500/40 bg-red-950/30 text-red-200', dot: 'bg-red-500' }
    : stats.advisoryCount > 0
      ? { text: `${stats.advisoryCount} near operating limit`, style: 'border-violet-500/35 bg-violet-950/25 text-violet-200', dot: 'bg-violet-400' }
      : { text: `${stats.nominalCount}/${stats.cells.length} within operating limits`, style: 'border-[#39ff14]/30 bg-green-950/25 text-[#8dff75]', dot: 'bg-[#39ff14]' };

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 md:col-span-2">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-200">
            <Battery className="h-5 w-5 text-emerald-400" /> Cell Voltage Balance
          </h3>
          <p className="mt-1 text-xs text-slate-500">One view of relative cell position and absolute LiFePO₄ voltage safety.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs font-semibold text-cyan-300">{stateLabel}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${safetySummary.style}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${safetySummary.dot}`} /> {safetySummary.text}
          </span>
        </div>
      </div>

      <div className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-3 text-xs ${assessment.style}`}>
        <span className="mt-0.5 shrink-0">{assessment.icon}</span>
        <div><span className="font-bold">{assessment.title}.</span> <span className="opacity-85">{assessment.detail}</span></div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-slate-800/55 px-3 py-2.5"><div className="text-slate-500">Minimum · Cell {stats.minCell}</div><div className="mt-1 font-mono font-semibold text-cyan-300">{stats.min} mV</div></div>
        <div className="rounded-lg bg-slate-800/55 px-3 py-2.5"><div className="text-slate-500">Pack average</div><div className="mt-1 font-mono font-semibold text-emerald-300">{stats.average.toFixed(1)} mV</div></div>
        <div className="rounded-lg bg-slate-800/55 px-3 py-2.5"><div className="text-slate-500">Maximum · Cell {stats.maxCell}</div><div className="mt-1 font-mono font-semibold text-[#8dff75]">{stats.max} mV</div></div>
        <div className="rounded-lg bg-slate-800/55 px-3 py-2.5"><div className="text-slate-500">Pack spread</div><div className="mt-1 font-mono font-semibold text-white">{stats.spread} mV</div></div>
      </div>

      <section aria-labelledby="integrated-cell-map-heading" className="mt-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h4 id="integrated-cell-map-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Activity className="h-4 w-4 text-cyan-400" /> Integrated cell map
            </h4>
            <p className="mt-1 text-[11px] text-slate-500">Fill shows position around average. The corner dot and border show absolute voltage safety.</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-500">BALANCE</span>
              <span className="rounded bg-cyan-950 px-1.5 py-0.5 text-cyan-300">LOW</span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-teal-200">AVG</span>
              <span className="rounded bg-green-950 px-1.5 py-0.5 text-[#8dff75]">HIGH</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-500">SAFETY</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#39ff14]" /> safe</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" /> near limit</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> unsafe</span>
            </div>
          </div>
        </div>

        <div className="mt-3 grid max-h-96 grid-cols-4 gap-2 overflow-y-auto p-1 text-sm font-mono sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12">
          {stats.cells.map(([cell, voltage]) => {
            const absolute = getAbsoluteStatus(voltage);
            const relative = getRelativeStyle(voltage, stats.average, stats.spread, significanceBoundary);
            const deviation = voltage - stats.average;
            const barWidth = Math.max(2, (Math.abs(deviation) / maxDeviation) * 48);
            const isMin = cell === stats.minCell;
            const isMax = cell === stats.maxCell;
            const isBalancing = snapshot.balancing?.[cell] === 'ACTIVE';
            return (
              <div
                key={cell}
                className={`relative rounded-lg border px-2 py-2.5 text-slate-100 transition-colors ${absolute.border} ${relative.bg}`}
                title={`Cell ${cell}: ${voltage} mV · ${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)} mV from average · ${relative.label} · ${absolute.label}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-semibold text-slate-400">CELL {cell}</span>
                  <span className="flex items-center gap-1">
                    {isBalancing && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" title="Balancing active" />}
                    <span className={`h-2 w-2 rounded-full ${absolute.dot}`} title={`Absolute voltage: ${absolute.label}`} />
                  </span>
                </div>
                <div className="mt-1 text-center text-sm font-bold">{voltage}</div>
                <div className="mt-0.5 text-center text-[10px] text-slate-300">{deviation >= 0 ? '+' : ''}{deviation.toFixed(1)} mV</div>
                <div className="relative mt-2 h-1 rounded-full bg-slate-950/60">
                  <span className="absolute left-1/2 top-[-1px] h-1.5 w-px bg-slate-500" />
                  {relative.direction === 'center' ? (
                    <span className={`absolute left-1/2 top-[-1px] h-1.5 w-1.5 -translate-x-1/2 rounded-full ${relative.bar}`} />
                  ) : (
                    <span
                      className={`absolute top-0 h-1 rounded-full ${relative.bar}`}
                      style={relative.direction === 'low' ? { right: '50%', width: `${barWidth}%` } : { left: '50%', width: `${barWidth}%` }}
                    />
                  )}
                </div>
                {(isMin || isMax) && (
                  <div className={`mt-1.5 text-center text-[8px] font-bold tracking-widest ${isMin ? 'text-cyan-300' : 'text-[#8dff75]'}`}>{isMin ? 'MIN' : 'MAX'}</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="voltage-reference-heading" className="mt-6 border-t border-slate-700/60 pt-5">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h4 id="voltage-reference-heading" className="text-sm font-semibold text-slate-300">LiFePO₄ voltage references</h4>
          <p className="text-[10px] text-slate-500">Absolute cell voltage—not balance thresholds</p>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <ReferenceCard label="Lower limits" value="2,000 / 2,500 mV" detail="Absolute floor / discharge cutoff" accent="border-l-red-500" />
          <ReferenceCard label="Nominal band" value="3,200–3,400 mV" detail="Normal operating range" accent="border-l-emerald-500" />
          <ReferenceCard label="Full target" value="3,550 mV" detail="Charge termination target" accent="border-l-[#39ff14]" />
          <ReferenceCard label="Absolute maximum" value="3,650 mV" detail="Critical upper limit" accent="border-l-red-500" />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-slate-500">
          {state === OPERATING_STATES.REST ? (
            <>
              <span>Rest monitor <strong className="text-amber-300">≥{thresholds.info} mV</strong></span>
              <span>Warning <strong className="text-orange-300">≥{thresholds.warning} mV</strong></span>
              <span>Critical <strong className="text-red-300">&gt;{thresholds.critical} mV</strong></span>
            </>
          ) : (
            <span>{stateLabel} extreme-spread guard <strong className="text-red-300">&gt;{thresholds.critical} mV</strong></span>
          )}
        </div>
      </section>

      {balanceAnalysis && (
        <section className={`mt-5 rounded-lg border p-4 ${balanceAnalysis.healthy ? 'border-emerald-500/30 bg-emerald-950/20' : balanceAnalysis.severity === 1 ? 'border-amber-500/30 bg-amber-950/20' : 'border-orange-500/30 bg-orange-950/20'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              {balanceAnalysis.healthy ? <CheckCircle className="h-4 w-4 text-emerald-400" /> : <TriangleAlert className="h-4 w-4 text-amber-400" />}
              Latest completed charge-to-rest check
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${balanceAnalysis.healthy ? 'bg-emerald-500/15 text-emerald-300' : balanceAnalysis.severity === 1 ? 'bg-amber-500/15 text-amber-300' : 'bg-orange-500/15 text-orange-300'}`}>{balanceAnalysis.status}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div><span className="text-slate-500">Peak charging</span><div className="mt-1 font-mono text-white">{balanceAnalysis.peakChargingSpread} mV</div></div>
            <div><span className="text-slate-500">Settled rest</span><div className="mt-1 font-mono text-white">{balanceAnalysis.spreadAtRest} mV</div></div>
            <div><span className="text-slate-500">Reduction</span><div className="mt-1 font-mono text-white">{balanceAnalysis.reductionPercent?.toFixed(0)}%</div></div>
            <div><span className="text-slate-500">Rest interval</span><div className="mt-1 font-mono text-white">{balanceAnalysis.restMinutes?.toFixed(0)} min</div></div>
          </div>
          <p className={`mt-3 text-xs ${balanceAnalysis.healthy ? 'text-emerald-300' : 'text-slate-400'}`}>
            {balanceAnalysis.healthy
              ? 'Cells converged normally after charging—a positive indicator of balance health.'
              : balanceAnalysis.severity === 1
                ? 'Convergence occurred, but the settled-rest spread remains in the monitoring band.'
                : 'Settled-rest spread did not resolve below 50 mV. Trend the next charge cycles and investigate if persistent.'}
          </p>
        </section>
      )}
    </div>
  );
};

export default CellVoltageHeatMaps;
