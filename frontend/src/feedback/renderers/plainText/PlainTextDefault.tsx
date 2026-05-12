import type { RendererProps } from "../shared/types";

export function PlainTextDefault({ question, value, onChange }: RendererProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={question.question_key}>
        Your answer
      </label>
      <textarea
        className="field-input field-textarea"
        id={question.question_key}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type your response"
        value={typeof value === "string" ? value : ""}
      />
    </div>
  );
}

