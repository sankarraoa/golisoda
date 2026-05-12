import type { RendererProps } from "../../shared/types";

export function CsatStars({
  value,
  onChange,
  max,
}: Pick<RendererProps, "value" | "onChange"> & { max: number }) {
  const selected = typeof value === "number" ? value : 0;
  const scores = Array.from({ length: max }, (_, index) => index + 1);
  return (
    <div className="csat-stars" role="radiogroup" aria-label="Rating">
      {scores.map((score) => (
        <button
          className={`csat-star-btn ${selected >= score ? "csat-star-btn--selected" : ""}`}
          key={score}
          type="button"
          aria-checked={selected === score}
          role="radio"
          onClick={() => onChange(score)}
        >
          <span aria-hidden className="csat-star-glyph">
            {selected >= score ? "★" : "☆"}
          </span>
        </button>
      ))}
    </div>
  );
}

