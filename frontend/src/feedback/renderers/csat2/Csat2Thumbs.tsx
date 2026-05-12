import type { RendererProps } from "../shared/types";

/** CSAT binary: value 2 = Yes, 1 = No (display Yes / thumbs-up first). */
export function Csat2Thumbs({ value, onChange }: RendererProps) {
  const items: Array<{ score: number; glyph: string; label: string }> = [
    { score: 2, glyph: "👍🏾", label: "Yes" },
    { score: 1, glyph: "👎🏾", label: "No" },
  ];
  return (
    <div className="thumbs-scale thumbs-scale--yes-no">
      {items.map(({ score, glyph, label }) => (
        <button
          className={`thumbs-scale-button ${value === score ? "thumbs-scale-button--selected" : ""}`}
          key={score}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => onChange(score)}
        >
          <span aria-hidden className="emoji-scale-glyph">
            {glyph}
          </span>
          <span className="thumbs-caption">{label}</span>
        </button>
      ))}
    </div>
  );
}

