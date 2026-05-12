import type { RendererProps } from "../shared/types";
import { SHORT_TEXT_MAX } from "../shared/constants";

export function ShortTextDefault({ question, value, onChange }: RendererProps) {
  return (
    <div className="field">
      <input
        aria-labelledby={`q-${question.question_key}`}
        autoComplete="on"
        className="field-input"
        id={question.question_key}
        maxLength={SHORT_TEXT_MAX}
        type="text"
        placeholder="Short answer"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

