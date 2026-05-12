import type { RendererProps } from "../shared/types";

export function PhoneDefault({ question, value, onChange }: RendererProps) {
  return (
    <div className="field">
      <input
        aria-labelledby={`q-${question.question_key}`}
        autoComplete="tel"
        className="field-input"
        id={question.question_key}
        inputMode="tel"
        spellCheck={false}
        type="tel"
        placeholder="+1 phone number"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

