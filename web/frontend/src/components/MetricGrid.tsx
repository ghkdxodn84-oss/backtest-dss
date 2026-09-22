import { useMemo, useState } from "react";

import { buildMetricSeries, type MetricSeries } from "../chart/metricSeries";
import type { ViewerResult } from "../types";
import { Sparkline } from "./Sparkline";

interface MetricGridProps {
  result: ViewerResult;
  period: string;
}

type MetricStyle = "money" | "ratio" | "percent" | "number" | "days" | "count";
type Tone = "lime" | "negative" | "muted";

interface MetricItem {
  label: string;
  value: number | null | undefined;
  style: MetricStyle;
  tone?: Tone;
  series?: MetricSeries;
}

function formatNumber(value: number | null | undefined, style: MetricStyle) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (style === "money") return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (style === "ratio") return `${(value * 100).toFixed(2)}%`;
  if (style === "percent") return `${value.toFixed(2)}%`;
  if (style === "days") return `${value.toFixed(1)}일`;
  if (style === "count") return value.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  return value.toFixed(2);
}

function Tile({ item }: { item: MetricItem }) {
  const [scrub, setScrub] = useState<number | null>(null);
  const series = item.series;
  const scrubbing = scrub != null && series != null;
  const shown = scrubbing ? series.values[scrub] : item.value;
  const tone = item.tone ?? "muted";
  return (
    <div className={`summary-metric${scrubbing ? " scrubbing" : ""}`}>
      <span>{item.label}</span>
      <strong className={tone === "muted" ? "" : tone}>{formatNumber(shown, item.style)}</strong>
      {series ? (
        <>
          <Sparkline values={series.values} tone={tone} activeIndex={scrub} onScrub={setScrub} />
          <small>{scrubbing ? series.dates[scrub] : " "}</small>
        </>
      ) : null}
    </div>
  );
}

function Metrics({ items }: { items: MetricItem[] }) {
  return (
    <div className="summary-grid">
      {items.map((item) => <Tile key={item.label} item={item} />)}
    </div>
  );
}

export function MetricGrid({ result, period }: MetricGridProps) {
  const { summary, realized_metrics: realized } = result;
  const target = result.meta.target_ticker;
  const momentum = result.meta.momentum_ticker;
  const s = useMemo(() => buildMetricSeries(result.equity), [result.equity]);

  const performance: MetricItem[] = [
    { label: "FINAL EQUITY", value: summary["Final Equity"], style: "money", tone: "lime", series: s.finalEquity },
    { label: "SHARPE / RF 0", value: summary["Sharpe (rf=0)"], style: "number", series: s.sharpe },
    { label: "VOLATILITY / ANN", value: summary["Volatility (ann)"], style: "ratio", series: s.volatility },
    { label: "MAX DRAWDOWN", value: summary["Max Drawdown"], style: "ratio", tone: "negative", series: s.drawdown },
    { label: "누적 수익률", value: summary["Strategy Return"], style: "percent", tone: "lime", series: s.strategyReturn },
    { label: `${target} 단순보유`, value: summary["Target Hold Return"], style: "percent", series: s.targetHold },
    { label: `${momentum} 단순보유`, value: summary["Momentum Hold Return"], style: "percent" },
    { label: "CAGR", value: summary.CAGR, style: "ratio", series: s.cagr },
  ];
  const realizedItems: MetricItem[] = [
    { label: "거래횟수", value: realized?.trade_count, style: "count" },
    { label: "MOC 횟수", value: realized?.moc_count, style: "count" },
    { label: "평균 보유일", value: realized?.avg_hold_days, style: "days" },
    { label: "이익금", value: realized?.net_profit, style: "money", tone: "lime" },
    { label: "평균 이익률", value: realized?.avg_gain_pct, style: "percent" },
    { label: "평균 손해률", value: realized?.avg_loss_pct, style: "percent", tone: "negative" },
    { label: "평균 실현이익", value: realized?.avg_gain, style: "money" },
    { label: "평균 실현손해", value: realized?.avg_loss, style: "money", tone: "negative" },
  ];

  return (
    <section className="summary-panel">
      <header className="panel-header"><span className="eyebrow">요약 지표 // SUMMARY</span><small>{target} · {period}</small></header>
      <Metrics items={performance} />
      <div className="subsection-label">실현 지표 // REALIZED</div>
      <Metrics items={realizedItems} />
    </section>
  );
}
