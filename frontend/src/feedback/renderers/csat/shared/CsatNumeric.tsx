import type { RendererProps } from "../../shared/types";

export function CsatNumeric({
  value,
  onChange,
  max,
}: Pick<RendererProps, "value" | "onChange"> & { max: number }) {
  const scores = Array.from({ length: max }, (_, index) => index + 1);
  return (
    <div className="nps-scale">
      <div className="nps-options">
        {scores.map((score) => (
          <button
            className={`scale-button ${value === score ? "scale-button--selected" : ""}`}
            key={score}
            type="button"
            onClick={() => onChange(score)}
          >
            {score}
          </button>
        ))}
      </div>
      <div className="scale-labels">
        <span>Poor</span>
        <span>Excellent</span>
      </div>
    </div>
  );
}

