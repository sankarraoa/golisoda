import type { NpsDashboardPayload, NpsTrendMonth } from "../../../types/admin";

const C_PROMOTER = "#2d8659";
const C_PASSIVE = "#e8b53d";
const C_DETRACTOR = "#c94545";

function formatSignedNps(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}`;
}

type StackBarProps = {
  promotersPct: number;
  passivesPct: number;
  detractorsPct: number;
};

function HorizontalNpsMixBar({
  promotersPct,
  passivesPct,
  detractorsPct,
}: StackBarProps) {
  const p = promotersPct ?? 0;
  const pas = passivesPct ?? 0;
  const d = detractorsPct ?? 0;
  const pctLbl = (v: number) => (v <= 4 ? "" : `${v}%`);
  return (
    <>
      <div className="analytics-nps-stackbar" aria-hidden>
        <div className="analytics-nps-stackbar-fill" style={{ width: `${p}%`, background: C_PROMOTER }}>
          <span className="analytics-nps-stackbar-pct">{pctLbl(p)}</span>
        </div>
        <div className="analytics-nps-stackbar-fill" style={{ width: `${pas}%`, background: C_PASSIVE }}>
          <span className="analytics-nps-stackbar-pct">{pctLbl(pas)}</span>
        </div>
        <div className="analytics-nps-stackbar-fill" style={{ width: `${d}%`, background: C_DETRACTOR }}>
          <span className="analytics-nps-stackbar-pct">{pctLbl(d)}</span>
        </div>
      </div>
      <div className="analytics-nps-stackbar-caption-row">
        <span>Promoters / Score 9–10</span>
        <span>Passives / Score 7–8</span>
        <span>Detractors / Score 0–6</span>
      </div>
    </>
  );
}

function computeLineScale(months: NpsTrendMonth[]) {
  const raw = months.map((m) => m.nps).filter((x): x is number => typeof x === "number");
  if (raw.length === 0) {
    return { minY: -20, maxY: 40 };
  }
  let min = Math.min(...raw, 0);
  let max = Math.max(...raw, 0);
  if (min === max) {
    min -= 12;
    max += 12;
  }
  const pad = Math.max(6, Math.round((max - min) * 0.12));
  return { minY: min - pad, maxY: max + pad };
}

function SvgSixMonthTrend({ compact, months }: { compact?: boolean; months: NpsTrendMonth[] }) {
  const VB_W = 800;
  const VB_H = compact ? 392 : 340;
  const ml = compact ? 52 : 64;
  const mr = compact ? 24 : 32;
  const mt = compact ? 12 : 36;
  const mb = compact ? 44 : 56;
  const iw = VB_W - ml - mr;
  const ih = VB_H - mt - mb;
  const baseY = VB_H - mb;
  const stackTop = mt + ih * (compact ? 0.05 : 0.14);
  const stackH = baseY - stackTop;
  const gridStrokeBaseline = compact ? 0.95 : 1.25;
  const gridStrokeDash = compact ? 0.55 : 0.85;
  const trendPathStroke = compact ? 3.4 : 2.5;
  const trendPointR = compact ? 3.5 : 5;
  const trendPointStroke = compact ? 2 : 2;
  const n = Math.max(months.length, 1);
  const gapBase = Math.max(
    8,
    (iw - Math.min(44, Math.floor(iw / n - 14)) * n) / (n + 1),
  );
  const barW = Math.min(
    44,
    Math.max(26, Math.floor((iw - gapBase * (n + 1)) / n)),
  );
  const totalBarTrack = gapBase * (n + 1) + barW * n;
  const xStart = ml + Math.max(0, (iw - totalBarTrack) / 2) + gapBase;

  const scale = computeLineScale(months);
  const lineMax = scale.maxY;
  const lineSpan = lineMax === scale.minY ? 1 : lineMax - scale.minY;

  function npsGraphY(score: number) {
    return stackTop + ((lineMax - score) / lineSpan) * stackH;
  }

  const linePoints = months.reduce<{ x: number; y: number; nps: number }[]>((acc, m, idx) => {
    if (m.nps === null || typeof m.nps !== "number") {
      return acc;
    }
    const cx = xStart + idx * (barW + gapBase) + barW / 2;
    acc.push({ x: cx, y: npsGraphY(m.nps), nps: m.nps });
    return acc;
  }, []);

  const path =
    linePoints.length > 1
      ? linePoints.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ")
      : "";

  const yTicks = compact ? [0, 50, 100] : [0, 25, 50, 75, 100];
  const gridYs = yTicks.map((pct) => ({
    pct,
    y: baseY - (pct / 100) * stackH,
  }));

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="img"
      aria-label="Six month NPS and response mix chart"
      className="analytics-nps-trend-svg"
    >
      {!compact ? (
        <>
          <text className="analytics-nps-corner-hint" x={ml} y={mt - 14}>
            Response mix (stacked bars)
          </text>
          <text className="analytics-nps-corner-hint analytics-nps-corner-hint--right" x={VB_W - mr - 280} y={mt - 14}>
            NPS line ━━
          </text>
        </>
      ) : null}

      {/* Y-axis */}
      {yTicks.map((tick) => {
        const gy = gridYs.find((g) => g.pct === tick)?.y ?? baseY - (tick / 100) * stackH;
        return (
          <g key={tick}>
            <line
              className="analytics-nps-gridline"
              x1={ml}
              x2={VB_W - mr}
              y1={gy}
              y2={gy}
              strokeDasharray={tick === 0 ? undefined : "3 8"}
              strokeWidth={tick === 0 ? gridStrokeBaseline : gridStrokeDash}
              stroke="#d8dada"
              shapeRendering="crispEdges"
            />
            <text className="analytics-nps-axis-y" x={ml - 12} y={gy + 4} textAnchor="end">
              {tick}%
            </text>
          </g>
        );
      })}

      {months.map((m, idx) => {
        const bx = xStart + idx * (barW + gapBase);
        let detH = stackH * (m.detractors_pct / 100);
        let pasH = stackH * (m.passives_pct / 100);
        let proH = Math.max(stackH - detH - pasH, 0);
        if (detH + pasH > stackH) {
          pasH = Math.max(stackH - detH, 0);
          proH = Math.max(stackH - detH - pasH, 0);
        }
        detH = Math.min(detH, stackH);
        return (
          <g key={`${m.year}-${m.month}`}>
            <rect
              fill={C_DETRACTOR}
              height={detH || 1}
              rx={detH <= 0.5 ? 0 : barW <= 34 ? 3 : 4}
              ry={detH <= 0.5 ? 0 : barW <= 34 ? 3 : 4}
              width={barW}
              x={bx}
              y={baseY - detH}
            />
            <rect fill={C_PASSIVE} height={pasH || 1} rx={barW <= 34 ? 2 : 3} ry={barW <= 34 ? 2 : 3} width={barW} x={bx} y={baseY - detH - pasH} />
            <rect fill={C_PROMOTER} height={proH <= 1 ? Math.max(proH, 0) : proH} rx={proH <= 1 ? 0 : barW <= 34 ? 3 : 4} ry={proH <= 1 ? 0 : barW <= 34 ? 3 : 4} width={barW} x={bx} y={stackTop} />
          </g>
        );
      })}

      {path.length > 0 ? (
        <path
          d={path}
          fill="none"
          stroke={compact ? "#0f172a" : "#111827"}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={trendPathStroke}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {linePoints.map((pt) => (
        <g key={`${pt.x}-${pt.y}`}>
          <circle
            cx={pt.x}
            cy={pt.y}
            fill="#ffffff"
            r={trendPointR}
            stroke={compact ? "#0f172a" : "#111827"}
            strokeWidth={trendPointStroke}
          />
          <text className="analytics-nps-line-label" x={pt.x} y={pt.y - (compact ? 8 : 12)} textAnchor="middle">
            {formatSignedNps(pt.nps)}
          </text>
        </g>
      ))}

      {months.map((m, idx) => (
        <text className="analytics-nps-axis-x" key={`lbl-${idx}`} x={xStart + idx * (barW + gapBase) + barW / 2} y={VB_H - 18} textAnchor="middle">
          {`${m.label} '${String(m.year).slice(-2)}`}
        </text>
      ))}
    </svg>
  );
}

export function NpsSurveyDashboard({
  data,
  compact = false,
}: {
  data: NpsDashboardPayload;
  compact?: boolean;
}) {
  const snap = data.snapshot;
  const hasSnap = snap.response_count > 0;
  const npsDisp = typeof snap.nps === "number" ? formatSignedNps(snap.nps) : "—";
  const npsTone =
    typeof snap.nps === "number" ? (snap.nps >= 0 ? "analytics-nps-score--positive" : "analytics-nps-score--negative") : "";
  const delta = data.nps_delta_vs_period_start;
  const deltaStr =
    typeof delta === "number"
      ? `${delta === 0 ? "—" : delta > 0 ? "▲" : "▼"} ${delta > 0 ? "+" : ""}${delta}`
      : null;

  return (
    <section className={`analytics-nps-card${compact ? " analytics-nps-card--compact" : ""}`}>
      <div className="analytics-nps-head">
        {!compact ? (
          <>
            <div className="analytics-nps-eyebrow">
              NET PROMOTER SCORE
              {data.reporting_period_label ? <span className="analytics-nps-period"> · {data.reporting_period_label}</span> : null}
            </div>
            <h3 className="analytics-nps-q-prompt">{data.prompt}</h3>
          </>
        ) : null}
        <div className="analytics-nps-hero-row">
          <span className={`analytics-nps-score ${npsTone}`}>{npsDisp}</span>
          {deltaStr ? (
            <span className={`analytics-nps-delta ${delta !== null && delta >= 0 ? "analytics-nps-delta--up" : "analytics-nps-delta--down"}`}>
              {deltaStr} vs period start
            </span>
          ) : (
            <span className="analytics-nps-delta-muted">Insufficient history for delta</span>
          )}
        </div>
      </div>
      {!hasSnap ? (
        <p className="analytics-nps-empty">No validated NPS answers for these filters.</p>
      ) : (
        <>
          <HorizontalNpsMixBar
            promotersPct={snap.promoters_pct}
            passivesPct={snap.passives_pct}
            detractorsPct={snap.detractors_pct}
          />
          {!compact ? (
            <p className="analytics-nps-formula">
              NPS = % Promoters − % Detractors = {snap.promoters_pct.toFixed(1)} − {snap.detractors_pct.toFixed(1)} ={" "}
              <strong>{typeof snap.nps === "number" ? formatSignedNps(snap.nps) : "—"}</strong>
            </p>
          ) : null}
        </>
      )}

      <div className="analytics-nps-trend-block">
        <h3 className="analytics-nps-subtitle">6-month trend</h3>
        {data.months.length === 0 ? (
          <p className="muted">No timeline data.</p>
        ) : (
          <>
            <SvgSixMonthTrend compact={Boolean(compact)} months={data.months} />
            <div className="analytics-nps-legend">
              <span>
                <i className="analytics-nps-leg-swatch" style={{ background: C_PROMOTER }} />
                Promoters
              </span>
              <span>
                <i className="analytics-nps-leg-swatch" style={{ background: C_PASSIVE }} />
                Passives
              </span>
              <span>
                <i className="analytics-nps-leg-swatch" style={{ background: C_DETRACTOR }} />
                Detractors
              </span>
              <span className="analytics-nps-leg-line-wrap">
                <svg width={28} height={10} aria-hidden>
                  <line stroke="#111827" strokeWidth={2.25} x1={0} x2={26} y1={5} y2={5} />
                </svg>
                NPS score
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
