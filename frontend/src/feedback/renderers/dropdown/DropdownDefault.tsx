import type { RendererProps } from "../shared/types";

export function DropdownDefault({ question, value, onChange }: RendererProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={question.question_key}>
        Select one
      </label>
      <select
        className="field-input"
        id={question.question_key}
        onChange={(event) => onChange(event.target.value)}
        value={typeof value === "string" ? value : ""}
      >
        <option value="">Choose an option</option>
        {question.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

