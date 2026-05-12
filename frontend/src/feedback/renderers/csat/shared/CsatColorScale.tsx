import type { RendererProps } from "../../shared/types";

export function CsatColorScale({
  value,
  onChange,
  max,
}: Pick<RendererProps, "value" | "onChange"> & { max: number }) {
  const scores = Array.from({ length: max }, (_, index) => index + 1);
  return (
    <div className="csat-color-scale" role="radiogroup" aria-label="Rating">
      {scores.map((score) => (
        <button
          className={`csat-color-scale-btn csat-color-scale-btn--${max} csat-color-scale-btn--i${score} ${
            value === score ? "csat-color-scale-btn--selected" : ""
          }`}
          key={score}
          type="button"
          aria-checked={value === score}
          role="radio"
          onClick={() => onChange(score)}
        >
          {score}
        </button>
      ))}
    </div>
  );
}

