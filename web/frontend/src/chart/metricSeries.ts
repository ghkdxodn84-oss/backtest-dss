// 요약 지표 타일의 스파크라인 시계열. 서버 응답의 equity 배열만으로 유도한다.
import type { EquityPoint } from "../types";

export interface MetricSeries {
  dates: string[];
  values: Array<number | null>;
}

const TRADING_DAYS = 252;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

function dailyReturns(equity: Array<number | null>) {
  const out: Array<number | null> = [null];
  for (let i = 1; i < equity.length; i += 1) {
    const prev = equity[i - 1];
    const cur = equity[i];
    out.push(finite(prev) && finite(cur) && prev > 0 ? cur / prev - 1 : null);
  }
  return out;
}

/** 롤링 창(기본 60거래일)으로 연율화 변동성·샤프를 계산한다 */
function rolling(returns: Array<number | null>, window: number, kind: "vol" | "sharpe") {
  const out: Array<number | null> = [];
  for (let i = 0; i < returns.length; i += 1) {
    const slice = returns.slice(Math.max(0, i - window + 1), i + 1).filter(finite);
    if (slice.length < Math.min(window, 20)) { out.push(null); continue; }
    const avg = mean(slice) as number;
    const variance = slice.reduce((acc, r) => acc + (r - avg) ** 2, 0) / Math.max(slice.length - 1, 1);
    const sd = Math.sqrt(variance);
    if (kind === "vol") out.push(sd * Math.sqrt(TRADING_DAYS));
    else out.push(sd > 0 ? (avg / sd) * Math.sqrt(TRADING_DAYS) : null);
  }
  return out;
}

export function buildMetricSeries(points: EquityPoint[]): Record<string, MetricSeries> {
  const dates = points.map((p) => p.date.slice(0, 10));
  const equity = points.map((p) => (finite(p.equity) ? p.equity : null));
  const price = points.map((p) => (finite(p.price) ? p.price : null));
  const e0 = equity.find(finite) ?? null;
  const p0 = price.find(finite) ?? null;
  const returns = dailyReturns(equity);
  let peak = -Infinity;
  const drawdown = equity.map((v) => {
    if (!finite(v)) return null;
    peak = Math.max(peak, v);
    return peak > 0 ? (v - peak) / peak : null;
  });

  const cagr = equity.map((v, i) => {
    if (!finite(v) || e0 == null || i < 20) return null;
    return (v / e0) ** (TRADING_DAYS / i) - 1;
  });

  const wrap = (values: Array<number | null>): MetricSeries => ({ dates, values });
  return {
    finalEquity: wrap(equity),
    strategyReturn: wrap(equity.map((v) => (finite(v) && e0 ? (v / e0 - 1) * 100 : null))),
    targetHold: wrap(price.map((v) => (finite(v) && p0 ? (v / p0 - 1) * 100 : null))),
    drawdown: wrap(drawdown),
    cagr: wrap(cagr),
    volatility: wrap(rolling(returns, 60, "vol")),
    sharpe: wrap(rolling(returns, 60, "sharpe")),
  };
}
