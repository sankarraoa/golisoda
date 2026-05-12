import type { RendererProps } from "../shared/types";

export function EmailDefault({ question, value, onChange }: RendererProps) {
  return (
    <div className="field">
      <input
        aria-labelledby={`q-${question.question_key}`}
        autoComplete="email"
        className="field-input"
        id={question.question_key}
        inputMode="email"
        spellCheck={false}
        type="email"
        placeholder="you@example.com"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

