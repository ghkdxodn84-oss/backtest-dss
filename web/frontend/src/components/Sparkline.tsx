import { useId, useMemo, useRef } from "react";

import { monotonePath } from "../chart/engine";

// viewBox 좌표계. preserveAspectRatio="none"으로 타일 폭에 맞춰 늘어난다
const W = 100;
const H = 30;
const PAD_Y = 3;

interface SparklineProps {
  values: Array<number | null>;
  tone: "lime" | "negative" | "muted";
  /** 스크럽 중인 인덱스. null이면 도트 없음 */
  activeIndex: number | null;
  onScrub: (index: number | null) => void;
}

export function Sparkline({ values, tone, activeIndex, onScrub }: SparklineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/:/g, "");
  const n = values.length;

  const { linePath, areaPath, yOf } = useMemo(() => {
    const valid = values.filter((v): v is number => v != null && Number.isFinite(v));
    if (valid.length < 2) return { linePath: "", areaPath: "", yOf: () => H / 2 };
    const lo = Math.min(...valid);
    const hi = Math.max(...valid);
    const span = hi - lo || Math.abs(hi) || 1;
    const x = (i: number) => (i / Math.max(n - 1, 1)) * W;
    const y = (v: number) => PAD_Y + ((hi - v) / span) * (H - PAD_Y * 2);
    const idx = values.map((v, i) => (v == null || !Number.isFinite(v) ? -1 : i)).filter((i) => i >= 0);
    const line = monotonePath(idx.map((i) => ({ x: x(i), y: y(values[i] as number) })));
    const area = `${line}L${x(idx[idx.length - 1]).toFixed(2)},${H}L${x(idx[0]).toFixed(2)},${H}Z`;
    return { linePath: line, areaPath: area, yOf: y };
  }, [values, n]);

  const onMove = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || !n) return;
    const ratio = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    onScrub(Math.round(ratio * (n - 1)));
  };

  const activeValue = activeIndex != null ? values[activeIndex] : null;
  const hasDot = activeIndex != null && activeValue != null && Number.isFinite(activeValue);

  if (!linePath) return <div className="sparkline empty" aria-hidden />;

  return (
    <div className="sparkline" aria-hidden>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className={`sparkline-svg ${tone}`}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => onScrub(null)}
      >
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${uid}-fill)`} />
        <path d={linePath} className="sparkline-line" />
        {activeIndex != null && (
          <line x1={(activeIndex / Math.max(n - 1, 1)) * W} x2={(activeIndex / Math.max(n - 1, 1)) * W} y1={0} y2={H} className="sparkline-cursor" />
        )}
      </svg>
      {/* preserveAspectRatio none에서는 svg circle이 찌그러지므로 HTML 도트 */}
      {hasDot && (
        <i
          className="sparkline-dot"
          style={{ left: `${(activeIndex / Math.max(n - 1, 1)) * 100}%`, top: `${(yOf(activeValue) / H) * 100}%` }}
        />
      )}
    </div>
  );
}
