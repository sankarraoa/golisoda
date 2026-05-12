import type { RendererProps } from "../shared/types";

export function Csat2YesNo({ value, onChange }: RendererProps) {
  return (
    <div className="csat-yes-no" role="group">
      <button
        className={`csat-yes-no-btn ${value === 1 ? "csat-yes-no-btn--selected" : ""}`}
        type="button"
        onClick={() => onChange(1)}
      >
        No
      </button>
      <button
        className={`csat-yes-no-btn ${value === 2 ? "csat-yes-no-btn--selected" : ""}`}
        type="button"
        onClick={() => onChange(2)}
      >
        Yes
      </button>
    </div>
  );
}

