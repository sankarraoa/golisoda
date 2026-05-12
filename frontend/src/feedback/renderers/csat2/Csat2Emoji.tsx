import type { RendererProps } from "../shared/types";

// Legacy behavior: csat_2 renderer "emoji_2" uses the same thumbs yes/no DOM.
export function Csat2Emoji(props: RendererProps) {
  return (
    <div className="thumbs-scale thumbs-scale--yes-no">
      {[
        { score: 2, glyph: "👍🏾", label: "Yes" },
        { score: 1, glyph: "👎🏾", label: "No" },
      ].map(({ score, glyph, label }) => (
        <button
          className={`thumbs-scale-button ${props.value === score ? "thumbs-scale-button--selected" : ""}`}
          key={score}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => props.onChange(score)}
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

