import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type { CellValue, OrderBookPayload } from "../types";

// Document Picture-in-Picture: 항상 위에 떠 있는 창에 주문을 한 건씩 띄워 MTS에 보고 따라 입력한다.
// Chrome·Edge 데스크톱(116+)만 지원하므로 나머지 브라우저에서는 버튼을 숨긴다.
interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

type Side = "sell" | "buy";

interface PipOrder {
  side: Side;
  label: string;
  price: number;
  qty: number;
  note: string;
}

/** 한 번에 보여줄 단위. 1주짜리 스프레드 매수는 한 장으로 묶는다. */
type PipStep = { kind: "single"; order: PipOrder } | { kind: "ladder"; orders: PipOrder[] };

const PIP_SIZE = { width: 400, height: 300 };

function num(value: CellValue) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildSteps(orders: OrderBookPayload["orders"]): PipStep[] {
  const parsed = orders.rows.flatMap((row) => {
    const kind = String(row["구분"] ?? "");
    const price = num(row["주문가"]);
    const qty = num(row["수량"]);
    if (price == null || qty == null || qty <= 0) return [];
    const side: Side = kind.startsWith("매도") ? "sell" : "buy";
    // "매도 (TP)" → "매도 TP", "매수 (+3주)" → "매수 +3주"
    const label = kind.replace(/\s*\((.+)\)/, " $1");
    // 매수 근거의 "→ TP: $x, SL: $y"는 입력과 무관해서 빼고, 현금 부족·퉁치기 같은 나머지 문구만 남긴다
    const note = String(row["비고"] ?? "").split(" | ").filter((part) => !part.startsWith("→ TP")).join(" | ");
    return [{ side, label, price, qty, note, spread: /^매수 \(\+/.test(kind) }];
  });
  // MTS 입력 순서: 매도 → 매수, 각각 높은 가격부터
  const byPrice = (a: PipOrder, b: PipOrder) => b.price - a.price;
  const sells = parsed.filter((o) => o.side === "sell").sort(byPrice);
  const buys = parsed.filter((o) => o.side === "buy" && !o.spread).sort(byPrice);
  const spreads = parsed.filter((o) => o.spread).sort(byPrice);
  const steps: PipStep[] = [...sells, ...buys].map((order) => ({ kind: "single", order }));
  if (spreads.length) steps.push({ kind: "ladder", orders: spreads });
  return steps;
}

function stepSide(step: PipStep): Side {
  return step.kind === "single" ? step.order.side : "buy";
}

function loadIndex(key: string) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function saveIndex(key: string, index: number) {
  try {
    localStorage.setItem(key, String(index));
  } catch {
    // storage unavailable: progress lasts until the window closes
  }
}

/** 메인 문서의 스타일시트를 PiP 창으로 옮긴다 (dev는 <style>, 빌드는 <link>). */
function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement("style");
      style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
      target.head.appendChild(style);
    } catch {
      if (!sheet.href) continue;
      const link = target.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      target.head.appendChild(link);
    }
  }
}

const qtyText = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: 4 });

function Chevron({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d={dir === "next" ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
    </svg>
  );
}

function PipStepper({
  steps,
  index,
  onMove,
  onReset,
}: {
  steps: PipStep[];
  index: number;
  onMove: (delta: number) => void;
  onReset: () => void;
}) {
  if (!steps.length) {
    return <div className="opip-end"><strong>주문 없음</strong><span>오늘 넣을 LOC 주문이 없습니다</span></div>;
  }
  if (index >= steps.length) {
    const count = steps.reduce((sum, step) => sum + (step.kind === "single" ? 1 : step.orders.length), 0);
    return (
      <div className="opip-end">
        <strong>오늘 주문 끝</strong>
        <span>{count}건을 모두 넣었습니다</span>
        <button type="button" className="opip-back opip-reset" onClick={onReset}>처음부터</button>
      </div>
    );
  }

  const step = steps[index];
  const last = index === steps.length - 1;
  return (
    <div className="opip-stage">
      <div className="opip-segs" aria-hidden>
        {steps.map((s, k) => <i key={k} className={`${stepSide(s)}${k < index ? " done" : ""}${k === index ? " cur" : ""}`} />)}
      </div>
      <div className="opip-meta">
        {step.kind === "single"
          ? <span className={`opip-tag ${step.order.side}`}>{step.order.label}</span>
          : <span className="opip-tag buy">매수 스프레드 {step.orders.length}건</span>}
        <span className="opip-count">{index + 1} / {steps.length}</span>
      </div>

      {step.kind === "single" ? (
        <div className="opip-main">
          <span className="opip-lbl">LOC 단가</span>
          <span className="opip-lbl">수량</span>
          <span className={`opip-price ${step.order.side}`}>{step.order.price.toFixed(2)}</span>
          <span className="opip-qty">{qtyText(step.order.qty)}<small>주</small></span>
          <span className="opip-note">{step.order.note || " "}</span>
        </div>
      ) : (
        <div className="opip-ladder">
          {step.orders.map((order, k) => (
            <div key={k} className="opip-ladder-row">
              <span className="opip-lbl">{order.label.replace(/^매수\s*/, "")}</span>
              <span className="opip-ladder-price">{order.price.toFixed(2)}</span>
              <span className="opip-ladder-qty">× {qtyText(order.qty)}주</span>
            </div>
          ))}
        </div>
      )}

      <div className="opip-nav">
        <button type="button" className="opip-back" disabled={index === 0} aria-label="이전 주문" onClick={() => onMove(-1)}><Chevron dir="prev" /></button>
        <button type="button" className="opip-go" onClick={() => onMove(1)}>
          {step.kind === "ladder" ? "다 넣었음" : "넣었음"} · {last ? "끝" : "다음"}<Chevron dir="next" />
        </button>
      </div>
    </div>
  );
}

export function OrderPipButton({
  orderBook,
  ticker,
  accountId,
}: {
  orderBook: OrderBookPayload;
  ticker: string;
  accountId?: string;
}) {
  const supported = typeof window !== "undefined" && "documentPictureInPicture" in window;
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const steps = useMemo(() => buildSteps(orderBook.orders), [orderBook.orders]);

  // 진행 위치는 계좌·세션 날짜·주문 내용별로 저장한다. 주문표가 바뀌면 처음부터 다시 시작한다.
  const progressKey = useMemo(() => {
    const signature = orderBook.orders.rows.map((row) => `${row["구분"]}@${row["주문가"]}x${row["수량"]}`).join("|");
    return `dongpa-pip-progress:${accountId ?? "local"}:${ticker}:${orderBook.state.last_date}:${signature}`;
  }, [accountId, ticker, orderBook.state.last_date, orderBook.orders.rows]);

  const [progress, setProgress] = useState(() => ({ key: progressKey, index: loadIndex(progressKey) }));
  const index = progress.key === progressKey ? progress.index : loadIndex(progressKey);

  const setIndex = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(steps.length, next));
    saveIndex(progressKey, clamped);
    setProgress({ key: progressKey, index: clamped });
  }, [progressKey, steps.length]);

  const move = useCallback((delta: number) => setIndex(index + delta), [index, setIndex]);

  useEffect(() => {
    if (!pipWindow) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        move(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      }
    };
    pipWindow.addEventListener("keydown", onKey);
    return () => pipWindow.removeEventListener("keydown", onKey);
  }, [pipWindow, move]);

  // 오더북 화면이 사라지면(다시 계산, 다른 탭) PiP 창도 닫는다.
  useEffect(() => () => pipWindow?.close(), [pipWindow]);

  const open = async () => {
    const api = window.documentPictureInPicture;
    if (!api) return;
    if (pipWindow) {
      pipWindow.close();
      return;
    }
    const win = await api.requestWindow(PIP_SIZE);
    copyStyles(win.document);
    win.document.title = `${ticker} LOC 주문`;
    win.document.body.className = "opip-root";
    win.addEventListener("pagehide", () => setPipWindow(null));
    setPipWindow(win);
  };

  if (!supported) return null;

  return (
    <>
      <button type="button" className={`button pip-launch${pipWindow ? " active" : ""}`} onClick={open} title="항상 위에 떠 있는 작은 창에 주문을 한 건씩 띄웁니다">
        {pipWindow ? "PIP 닫기" : "PIP로 띄우기"}
      </button>
      {pipWindow && createPortal(
        <PipStepper steps={steps} index={index} onMove={move} onReset={() => setIndex(0)} />,
        pipWindow.document.body,
      )}
    </>
  );
}
