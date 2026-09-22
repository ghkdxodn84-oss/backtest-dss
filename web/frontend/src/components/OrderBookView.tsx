import type { BacktestRequest, OrderBookPayload, ViewerResult } from "../types";
import { DataTable } from "./DataTable";
import { EquityChart } from "./EquityChart";
import { LocLadder } from "./LocLadder";
import { MetricGrid } from "./MetricGrid";

export function OrderBookView({
  orderBook,
  result,
  request,
}: {
  orderBook: OrderBookPayload;
  result: ViewerResult;
  request: BacktestRequest;
}) {
  const state = orderBook.state;
  const period = `${result.meta.start_date} – ${result.meta.end_date}`;

  return (
    <div className="result-stack orderbook-stack">
      <section className="order-overview-grid">
        <article className="current-mode-card">
          <header><span className="eyebrow">현재 모드 // CURRENT MODE</span><small>{request.strategy.mode_switch_strategy.toUpperCase()} ({request.strategy.momentum_ticker})</small></header>
          <div className="current-mode-title"><strong>{state.current_mode === "offense" ? "공세 모드" : "안전 모드"}</strong><span>{state.current_mode === "offense" ? "AGGRESSIVE" : "SAFE"}</span></div>
          <p>{state.rsi_value == null ? "현재 전략 규칙으로 다음 거래일 모드를 계산했습니다." : <>주봉 RSI <b>{state.rsi_value.toFixed(2)}</b>를 기준으로 현재 모드가 결정되었습니다.</>}</p>
          <div className="rsi-scale"><span>안전 영역</span><i style={{ left: `${Math.max(0, Math.min(100, state.rsi_value ?? 50))}%` }} /><span>공세 영역</span></div>
        </article>
        <section className="snapshot-grid">
          <article><span>최근 종가 // LAST CLOSE</span><strong>${state.prev_close?.toFixed(2) ?? "—"}</strong><small>{state.last_date}</small></article>
          <article><span>잔여 현금 // CASH</span><strong>${state.current_cash.toLocaleString("en-US", { maximumFractionDigits: 0 })}</strong><small>가용 자금</small></article>
          <article><span>보유 수량 // SHARES</span><strong>{state.current_position_qty.toLocaleString()}주</strong><small>{orderBook.holdings.rows.length} 트랜치</small></article>
          <article><span>트랜치 예산 // BUDGET</span><strong>${state.tranche_budget?.toLocaleString("en-US", { maximumFractionDigits: 0 }) ?? "—"}</strong><small>초기현금 ÷ 분할수</small></article>
        </section>
      </section>

      <LocLadder orderBook={orderBook} footer={orderBook.netting_message || "모의 계산 결과 · 실제 주문은 사용자 책임"} />

      <DataTable title="보유 포지션" eyebrow="OPEN TRANCHES" table={orderBook.holdings} filename={`dongpa_holdings_${result.meta.target_ticker}.csv`} limit={0} />

      <section className="order-detail-grid">
        <div className="detail-card">
          <header className="panel-header"><span className="eyebrow">퉁치기 상세 // NETTING</span><small>{orderBook.netting_scenarios.rows.length} 구간</small></header>
          {orderBook.netting_scenarios.rows.length ? <DataTable title="종가 구간별 순결과" eyebrow="SCENARIOS" table={orderBook.netting_scenarios} filename={`dongpa_netting_${result.meta.target_ticker}.csv`} limit={0} embedded /> : <div className="compact-empty">상쇄 대상이 없습니다.</div>}
        </div>
        <div className="detail-card">
          <header className="panel-header"><span className="eyebrow">손절 주문 // STOP LOSS</span><small>{orderBook.stop_loss_orders.rows.length}건</small></header>
          {orderBook.stop_loss_orders.rows.length ? <DataTable title="손절 주문" eyebrow="SL" table={orderBook.stop_loss_orders} filename={`dongpa_stop_loss_${result.meta.target_ticker}.csv`} limit={0} embedded copyColumn="주문가" /> : <div className="disabled-state"><strong>손절 비활성 // SL = 0.0%</strong><p>손절값을 설정하면 트랜치별 손절가가 여기에 표시됩니다.</p></div>}
        </div>
      </section>

      <MetricGrid result={result} period={period} />
      <EquityChart points={result.equity} modeBands={result.mode_bands} logScale={result.meta.log_scale} target={result.meta.target_ticker} />
      <DataTable title="일일 거래 요약" eyebrow="DAILY LOG" table={result.journal} filename={`dongpa_daily_${result.meta.target_ticker}.csv`} limit={8} />
    </div>
  );
}
