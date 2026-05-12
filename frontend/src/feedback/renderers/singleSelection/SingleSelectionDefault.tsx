import type { RendererProps } from "../shared/types";

export function SingleSelectionDefault({ question, value, onChange }: RendererProps) {
  return (
    <div className="option-list option-list--inline" role="group" aria-labelledby={`q-${question.question_key}`}>
      {question.options.map((option) => (
        <button
          className={`option-button ${value === option.value ? "option-button--selected" : ""}`}
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

