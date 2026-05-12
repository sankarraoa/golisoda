import type { RendererProps } from "../shared/types";

export function NpsNumeric({ value, onChange }: RendererProps) {
  return (
    <div className="nps-scale nps-scale--heatmap">
      <div className="nps-options nps-options--heatmap" role="radiogroup" aria-label="Likelihood score 0–10">
        {Array.from({ length: 11 }, (_, score) => (
          <button
            aria-checked={value === score}
            className={`nps-heatmap-cell nps-heatmap-cell--s${score} ${value === score ? "nps-heatmap-cell--selected" : ""}`}
            key={score}
            role="radio"
            type="button"
            onClick={() => onChange(score)}
          >
            <span className="nps-heatmap-cell-label">{score}</span>
          </button>
        ))}
      </div>
      <div className="scale-labels scale-labels--heatmap-nps">
        <span>Not at all likely</span>
        <span>Extremely likely</span>
      </div>
    </div>
  );
}

