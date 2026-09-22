import { useCallback, useId, useMemo, useRef, useState } from "react";

import {
  formatAxisMoney,
  formatMoney,
  formatSignedPct,
  monotonePath,
  niceTicks,
  segmentedPath,
  useElementWidth,
  useHoverIndexKeys,
  usePrefersReducedMotion,
  useTween,
  useTweenNumber,
} from "../chart/engine";
import type { EquityPoint, TablePayload } from "../types";

interface EquityChartProps {
  points: EquityPoint[];
  modeBands: TablePayload;
  logScale: boolean;
  target: string;
}

// 거래일 기준 봉 수. null은 전체 기간
const RANGES: Array<{ label: string; bars: number | null }> = [
  { label: "1M", bars: 21 },
  { label: "3M", bars: 63 },
  { label: "6M", bars: 126 },
  { label: "1Y", bars: 252 },
  { label: "ALL", bars: null },
];

const PAD = { top: 12, right: 60, bottom: 24, left: 8 };
const DRAWDOWN_SHARE = 0.22;
const GAP = 16;

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

/** 로그축용 눈금: 10의 거듭제곱 × {1, 2, 5} */
function logTicks(lo: number, hi: number) {
  const out: number[] = [];
  for (let exp = Math.floor(Math.log10(Math.max(lo, 1e-9))); exp <= Math.ceil(Math.log10(hi)); exp += 1) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** exp;
      if (v >= lo && v <= hi) out.push(v);
    }
  }
  return out.length >= 2 ? out : niceTicks(lo, hi, 4);
}

export function EquityChart({ points, modeBands, logScale, target }: EquityChartProps) {
  const reduce = usePrefersReducedMotion();
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/:/g, "");
  const [rangeLabel, setRangeLabel] = useState("ALL");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // 전체 기간 기준 드로다운 (구간을 잘라도 고점은 전체 기준으로 유지)
  const drawdownAll = useMemo(() => {
    let peak = -Infinity;
    return points.map((point) => {
      if (!finite(point.equity)) return null;
      peak = Math.max(peak, point.equity);
      return peak > 0 ? ((point.equity - peak) / peak) * 100 : 0;
    });
  }, [points]);

  const range = RANGES.find((r) => r.label === rangeLabel) ?? RANGES[RANGES.length - 1];
  const viewStart = range.bars == null || range.bars >= points.length ? 0 : points.length - range.bars;
  const view = useMemo(() => points.slice(viewStart), [points, viewStart]);
  const n = view.length;
  const equity = useMemo(() => view.map((p) => (finite(p.equity) ? p.equity : null)), [view]);
  const drawdown = useMemo(() => drawdownAll.slice(viewStart), [drawdownAll, viewStart]);

  // 단순보유 곡선: 구간 시작 시점의 에쿼티에 맞춰 가격을 리베이스해 같은 축에 그린다
  const hold = useMemo(() => {
    const anchor = view.find((p) => finite(p.equity) && finite(p.price));
    if (!anchor) return view.map(() => null);
    const base = (anchor.equity as number) / (anchor.price as number);
    return view.map((p) => (finite(p.price) ? p.price * base : null));
  }, [view]);

  const transform = useCallback((v: number) => (logScale ? Math.log10(Math.max(v, 1e-6)) : v), [logScale]);
  const untransform = useCallback((v: number) => (logScale ? 10 ** v : v), [logScale]);

  const w = Math.max(width, 280);
  const h = width > 0 && width < 600 ? 280 : 360;
  const x0 = PAD.left;
  const x1 = w - PAD.right;
  const plotW = Math.max(1, x1 - x0);
  const innerTop = PAD.top;
  const innerBottom = h - PAD.bottom;
  const ddH = (innerBottom - innerTop) * DRAWDOWN_SHARE;
  const valueTop = innerTop;
  const valueBottom = innerBottom - ddH - GAP;
  const ddTop = innerBottom - ddH;
  const step = plotW / Math.max(n, 1);
  const cx = useCallback((i: number) => x0 + step * (i + 0.5), [x0, step]);

  const rawDomain = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i += 1) {
      for (const v of [equity[i], hold[i]]) {
        if (v == null) continue;
        lo = Math.min(lo, transform(v));
        hi = Math.max(hi, transform(v));
      }
    }
    if (!Number.isFinite(lo)) return [0, 1] as const;
    const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.05 || 1;
    return [lo - pad, hi + pad] as const;
  }, [equity, hold, n, transform]);
  const [dLo, dHi] = useTween([rawDomain[0], rawDomain[1]], { duration: 520, enabled: !reduce });
  const valueY = useCallback(
    (v: number) => valueBottom - ((transform(v) - dLo) / (dHi - dLo || 1)) * (valueBottom - valueTop),
    [dLo, dHi, valueBottom, valueTop, transform],
  );

  const maxDrawdown = useMemo(() => Math.min(0, ...drawdown.filter(finite)), [drawdown]);
  const ddY = useCallback(
    (v: number) => ddTop + (Math.abs(v) / Math.max(1, Math.abs(maxDrawdown))) * ddH,
    [ddTop, ddH, maxDrawdown],
  );

  const equityPath = useMemo(() => segmentedPath(equity, cx, valueY), [equity, cx, valueY]);
  const holdPath = useMemo(() => segmentedPath(hold, cx, valueY), [hold, cx, valueY]);
  const areaPath = useMemo(() => {
    const idx = equity.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
    if (!idx.length) return "";
    const line = monotonePath(idx.map((i) => ({ x: cx(i), y: valueY(equity[i] as number) })));
    return `${line}L${cx(idx[idx.length - 1]).toFixed(2)},${valueBottom}L${cx(idx[0]).toFixed(2)},${valueBottom}Z`;
  }, [equity, cx, valueY, valueBottom]);
  const ddPath = useMemo(() => {
    const idx = drawdown.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
    if (!idx.length) return "";
    const line = monotonePath(idx.map((i) => ({ x: cx(i), y: ddY(drawdown[i] as number) })));
    return `${line}L${cx(idx[idx.length - 1]).toFixed(2)},${ddTop}L${cx(idx[0]).toFixed(2)},${ddTop}Z`;
  }, [drawdown, cx, ddY, ddTop]);

  const valueTicks = useMemo(() => {
    const lo = untransform(dLo);
    const hi = untransform(dHi);
    return logScale ? logTicks(lo, hi) : niceTicks(lo, hi, 4);
  }, [dLo, dHi, logScale, untransform]);
  const timeTicks = useMemo(() => {
    if (!n) return [];
    const want = Math.max(2, Math.min(6, Math.floor(plotW / 96)));
    const gap = Math.max(1, Math.floor((n - 1) / (want - 1 || 1)));
    const out: number[] = [];
    for (let i = 0; i < n; i += gap) out.push(i);
    if (out[out.length - 1] !== n - 1) {
      while (out.length && cx(n - 1) - cx(out[out.length - 1]) < 70) out.pop();
      out.push(n - 1);
    }
    return out;
  }, [n, plotW, cx]);

  // 공세 모드 구간 밴드 (현재 뷰에 걸치는 부분만). 밴드 경계가 휴장일이면 가장 가까운 거래일로 붙인다
  const dates = useMemo(() => points.map((p) => p.date.slice(0, 10)), [points]);
  const bands = useMemo(() => {
    const firstOnOrAfter = (date: string) => {
      let lo = 0;
      let hi = dates.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (dates[mid] < date) lo = mid + 1; else hi = mid; }
      return lo;
    };
    const out: Array<{ key: number; x: number; width: number }> = [];
    modeBands.rows.forEach((band, key) => {
      if (band.mode !== "공세") return;
      const startDate = String(band.start).slice(0, 10);
      const endDate = String(band.end).slice(0, 10);
      const start = firstOnOrAfter(startDate);
      const endProbe = firstOnOrAfter(endDate);
      const end = dates[endProbe] === endDate ? endProbe : endProbe - 1;
      const s = Math.max(start - viewStart, 0);
      const e = Math.min(end - viewStart, n - 1);
      if (e < 0 || s > n - 1 || e < s) return;
      out.push({ key, x: cx(s) - step / 2, width: Math.max(2, (e - s + 1) * step) });
    });
    return out;
  }, [modeBands, dates, viewStart, n, cx, step]);

  // 리드아웃: 호버 중이면 그 시점, 아니면 마지막 시점
  const activeIndex = hoverIndex ?? n - 1;
  const active = view[activeIndex];
  const firstEquity = equity.find(finite) ?? null;
  const firstHold = hold.find(finite) ?? null;
  const activeEquity = equity[activeIndex];
  const activeHold = hold[activeIndex];
  const rangeReturn = finite(activeEquity) && firstEquity ? ((activeEquity - firstEquity) / firstEquity) * 100 : null;
  const holdReturn = finite(activeHold) && firstHold ? ((activeHold - firstHold) / firstHold) * 100 : null;
  const activeDd = drawdown[activeIndex] ?? null;
  const up = (rangeReturn ?? 0) >= 0;
  const displayEquity = useTweenNumber(finite(activeEquity) ? activeEquity : 0, { duration: 260, enabled: !reduce && hoverIndex == null });

  const onKeyDown = useHoverIndexKeys(n, setHoverIndex);
  const onMove = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = ((clientX - box.left) / box.width) * w;
    setHoverIndex(Math.max(0, Math.min(n - 1, Math.floor((x - x0) / step))));
  };

  const ready = width > 0 && n > 0;
  const hoverPoint = hoverIndex != null ? view[hoverIndex] : null;
  const animate = !reduce;

  return (
    <section className="chart-card">
      <header className="section-heading chart-heading">
        <div>
          <span className="eyebrow">PERFORMANCE / DAILY</span>
          <h2>Equity Curve vs {target}</h2>
        </div>
        <div className="range-selector" role="tablist" aria-label="차트 기간">
          {RANGES.map((r) => {
            const disabled = r.bars != null && r.bars >= points.length;
            return (
              <button
                key={r.label}
                type="button"
                role="tab"
                aria-selected={r.label === rangeLabel}
                className={r.label === rangeLabel ? "active" : ""}
                disabled={disabled}
                onClick={() => { setRangeLabel(r.label); setHoverIndex(null); }}
              >{r.label}</button>
            );
          })}
        </div>
      </header>

      <div className="chart-readout">
        <div className="readout-main">
          <strong>{finite(activeEquity) ? formatMoney(hoverIndex == null ? displayEquity : activeEquity) : "—"}</strong>
          <b className={up ? "lime" : "negative"}>{rangeReturn == null ? "—" : formatSignedPct(rangeReturn)}</b>
          <span>{active?.date.slice(0, 10) ?? ""}{hoverIndex == null ? " · LATEST" : ""}</span>
        </div>
        <div className="readout-sub">
          <span><i className="swatch equity" />EQUITY 누적 <b>{rangeReturn == null ? "—" : formatSignedPct(rangeReturn)}</b></span>
          <span><i className="swatch hold" />{target} 누적 <b>{holdReturn == null ? "—" : formatSignedPct(holdReturn)}</b></span>
          <span>{target} <b>{finite(active?.price) ? `$${active.price.toFixed(2)}` : "—"}</b></span>
          <span><i className="swatch dd" />DD <b className={activeDd != null && activeDd < -5 ? "negative" : ""}>{activeDd == null ? "—" : `${activeDd.toFixed(2)}%`}</b></span>
          <span className="readout-scale">{logScale ? "LOG" : "LINEAR"}</span>
        </div>
      </div>

      <div className="chart-wrap" ref={wrapRef}>
        <div className="chart-plot" style={{ height: h }}>
          {ready && (
            <svg
              ref={svgRef}
              width={w}
              height={h}
              viewBox={`0 0 ${w} ${h}`}
              role="img"
              aria-label={`${target} 에쿼티 ${finite(activeEquity) ? formatMoney(activeEquity) : ""}, 구간 수익률 ${rangeReturn == null ? "" : formatSignedPct(rangeReturn)}, 최대 드로다운 ${maxDrawdown.toFixed(2)}%`}
              tabIndex={0}
              onKeyDown={onKeyDown}
              onBlur={() => setHoverIndex(null)}
              onPointerMove={(e) => onMove(e.clientX)}
              onPointerDown={(e) => onMove(e.clientX)}
              onPointerLeave={() => setHoverIndex(null)}
            >
              <defs>
                <linearGradient id={`${uid}-area`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--lime)" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="var(--lime)" stopOpacity="0" />
                </linearGradient>
                <linearGradient id={`${uid}-dd`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--magenta)" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="var(--magenta)" stopOpacity="0.05" />
                </linearGradient>
                <clipPath id={`${uid}-clip`}><rect x={x0} y={valueTop} width={plotW} height={valueBottom - valueTop} /></clipPath>
              </defs>

              {bands.map((band) => (
                <rect key={band.key} x={band.x} y={valueTop} width={band.width} height={valueBottom - valueTop} className="mode-band" />
              ))}

              <g shapeRendering="crispEdges">
                {valueTicks.map((tick) => {
                  const y = valueY(tick);
                  if (y < valueTop - 1 || y > valueBottom + 1) return null;
                  return <line key={tick} x1={x0} x2={x1} y1={y} y2={y} className="grid-line" />;
                })}
              </g>
              <g className="axis-text">
                {valueTicks.map((tick) => {
                  const y = valueY(tick);
                  if (y < valueTop - 1 || y > valueBottom + 1) return null;
                  return <text key={tick} x={x1 + 8} y={y} dominantBaseline="middle">{formatAxisMoney(tick)}</text>;
                })}
              </g>

              <g key={`${rangeLabel}-value`} clipPath={`url(#${uid}-clip)`}>
                <path d={areaPath} fill={`url(#${uid}-area)`} className={animate ? "chart-fade" : ""} />
                <path d={holdPath} className="hold-line" />
                <path d={equityPath} className={`equity-line${animate ? " chart-draw" : ""}`} pathLength={1} />
              </g>

              <g key={`${rangeLabel}-dd`}>
                <line x1={x0} x2={x1} y1={ddTop} y2={ddTop} className="pane-divider" shapeRendering="crispEdges" />
                <path d={ddPath} fill={`url(#${uid}-dd)`} className={`dd-area${animate ? " chart-fade" : ""}`} />
                <text x={x0 + 2} y={ddTop - 5} className="pane-label">DRAWDOWN</text>
                <text x={x1 + 8} y={ddTop + ddH} dominantBaseline="middle" className="axis-text negative-text">{maxDrawdown.toFixed(1)}%</text>
              </g>

              <g className="axis-text">
                {timeTicks.map((i) => (
                  <text key={i} x={Math.max(x0 + 30, Math.min(x1 - 30, cx(i)))} y={innerBottom + 15} textAnchor="middle">{view[i].date.slice(0, 10)}</text>
                ))}
              </g>

              {hoverPoint && hoverIndex != null && (
                <g>
                  <line x1={cx(hoverIndex)} x2={cx(hoverIndex)} y1={valueTop} y2={innerBottom} className="hover-line" />
                  {finite(equity[hoverIndex]) && <circle cx={cx(hoverIndex)} cy={valueY(equity[hoverIndex] as number)} r={4.5} className="hover-dot equity" />}
                  {finite(hold[hoverIndex]) && <circle cx={cx(hoverIndex)} cy={valueY(hold[hoverIndex] as number)} r={3} className="hover-dot hold" />}
                  {finite(drawdown[hoverIndex]) && <circle cx={cx(hoverIndex)} cy={ddY(drawdown[hoverIndex] as number)} r={3} className="hover-dot dd" />}
                  <g transform={`translate(${Math.max(x0 + 40, Math.min(x1 - 40, cx(hoverIndex)))}, ${innerBottom + 4})`}>
                    <rect x={-40} y={0} width={80} height={17} className="date-pill" />
                    <text x={0} y={9} textAnchor="middle" dominantBaseline="middle" className="date-pill-text">{hoverPoint.date.slice(0, 10)}</text>
                  </g>
                </g>
              )}
            </svg>
          )}
        </div>
      </div>
    </section>
  );
}
