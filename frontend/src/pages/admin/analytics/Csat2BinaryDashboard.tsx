import type { Csat2DashboardPayload, Csat2TrendMonth } from "../../../types/admin";

const CSAT_GREEN = "#2d8659";
const TEXT = "#1a1a1a";
const MUTED = "#666666";
const GRID = "#e0e0e0";

function formatInt(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function SvgCsatSixMonthTrend({ months }: { months: Csat2TrendMonth[] }) {
  const VB_W = 800;
  const VB_H = 260;
  const ml = 54;
  const mr = 26;
  const mt = 26;
  const mb = 38;
  const iw = VB_W - ml - mr;
  const ih = VB_H - mt - mb;

  const vals = months
    .map((m) => m.csat_pct)
    .filter((x): x is number => typeof x === "number" && !Number.isNaN(x));
  let yMin = 70;
  let yMax = 100;
  if (vals.length > 0) {
    yMin = Math.min(...vals);
    yMax = Math.max(...vals);
    const pad = Math.max(2, (yMax - yMin) * 0.12);
    yMin = Math.floor((yMin - pad) / 5) * 5;
    yMax = Math.ceil((yMax + pad) / 5) * 5;
    yMin = Math.max(0, yMin);
    yMax = Math.min(100, yMax);
    if (yMax - yMin < 10) {
      yMax = Math.min(100, yMin + 10);
    }
  }
  const span = yMax - yMin || 1;
  const ticks = [0, 1, 2, 3, 4].map((i) => yMin + (i / 4) * span);

  function xFor(i: number) {
    const n = months.length;
    if (n <= 1) {
      return ml + iw / 2;
    }
    return ml + (i / (n - 1)) * iw;
  }

  function yFor(pct: number) {
    return mt + ih - ((pct - yMin) / span) * ih;
  }

  const plotted = months
    .map((m, i) => ({ m, i, pct: m.csat_pct }))
    .filter((row): row is { m: Csat2TrendMonth; i: number; pct: number } => typeof row.pct === "number");

  const pathD =
    plotted.length > 0
      ? plotted.map((row, idx) => `${idx === 0 ? "M" : "L"} ${xFor(row.i)} ${yFor(row.pct)}`).join(" ")
      : "";

  const lastIdx = Math.max(months.length - 1, 0);

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="img"
      aria-label="Six month CSAT percentage trend"
      className="analytics-csat-trend-svg"
    >
      {ticks.map((tick) => {
        const gy = yFor(tick);
        const lbl =
          Math.abs(tick - Math.round(tick)) < 0.001 ? `${Math.round(tick)}%` : `${tick.toFixed(1)}%`;
        return (
          <g key={tick}>
            <line stroke={GRID} strokeWidth={1} x1={ml} x2={VB_W - mr} y1={gy} y2={gy} />
            <text fill={MUTED} fontSize={12} textAnchor="end" x={ml - 8} y={gy + 4}>
              {lbl}
            </text>
          </g>
        );
      })}

      {pathD.length > 0 ? (
        <path
          d={pathD}
          fill="none"
          stroke={CSAT_GREEN}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}

      {months.map((m, i) => {
        if (typeof m.csat_pct !== "number") {
          return null;
        }
        const cx = xFor(i);
        const cy = yFor(m.csat_pct);
        const isLatest = i === lastIdx;
        return (
          <g key={`${m.year}-${m.month}`}>
            <text fill={TEXT} fontSize={12} fontWeight={600} textAnchor="middle" x={cx} y={cy - 14}>
              {m.csat_pct.toFixed(1)}%
            </text>
            <circle
              cx={cx}
              cy={cy}
              fill={isLatest ? CSAT_GREEN : "#ffffff"}
              r={isLatest ? 7 : 5}
              stroke={CSAT_GREEN}
              strokeWidth={isLatest ? 2.5 : 2}
            />
          </g>
        );
      })}

      {months.map((m, i) => (
        <text
          fill={MUTED}
          fontSize={11}
          key={`x-${m.year}-${m.month}`}
          textAnchor="middle"
          x={xFor(i)}
          y={VB_H - 14}
        >
          {m.label}
        </text>
      ))}
    </svg>
  );
}

export function Csat2BinaryDashboard({
  data,
  compact = false,
}: {
  data: Csat2DashboardPayload;
  compact?: boolean;
}) {
  const snap = data.snapshot;
  const pctHead =
    typeof snap.csat_pct === "number"
      ? `${snap.csat_pct.toFixed(1)}%`
      : "—";

  return (
    <div className={`analytics-csat-scope${compact ? " analytics-csat-scope--compact" : ""}`}>
      <div className="analytics-csat-card">
        <section className="analytics-csat-section1">
          <p className="analytics-csat-eyebrow">
            Customer Satisfaction
            {data.reporting_period_label ? (
              <span className="analytics-csat-eyebrow-period"> · {data.reporting_period_label}</span>
            ) : null}
          </p>
          <div className={`analytics-csat-hero-pct${compact ? " analytics-csat-hero-pct--compact" : ""}`}>
            {pctHead}
          </div>
          <p className="analytics-csat-line">
            {formatInt(snap.yes_count)} of {formatInt(snap.cohort_response_count)} responses said Yes
          </p>
          <p className="analytics-csat-line analytics-csat-line--muted">
            Response rate: {snap.response_rate_pct.toFixed(0)}%
          </p>
        </section>

        <section className="analytics-csat-section2">
          <h3 className="analytics-csat-trend-title">6-Month Trend</h3>
          {data.months.length === 0 ? (
            <p className="muted">No timeline data.</p>
          ) : (
            <SvgCsatSixMonthTrend months={data.months} />
          )}
        </section>
      </div>
    </div>
  );
}
