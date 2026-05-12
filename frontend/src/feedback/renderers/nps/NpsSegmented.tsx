import type { RendererProps } from "../shared/types";
import { NPS_SEGMENTS } from "../shared/constants";

export function NpsSegmented({ value, onChange }: RendererProps) {
  return (
    <div className="nps-scale nps-scale--segmented" role="group">
      <div className="nps-segments">
        {NPS_SEGMENTS.map((segment) => (
          <div className="nps-segment" key={segment.label}>
            <div className="nps-segment-label">{segment.label}</div>
            <div className="nps-segment-scores">
              {segment.scores.map((score) => (
                <button
                  className={`scale-button scale-button--segment ${value === score ? "scale-button--selected" : ""}`}
                  key={score}
                  type="button"
                  onClick={() => onChange(score)}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="scale-labels">
        <span>Not at all likely</span>
        <span>Extremely likely</span>
      </div>
    </div>
  );
}

