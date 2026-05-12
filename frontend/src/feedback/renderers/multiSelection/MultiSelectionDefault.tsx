import type { RendererProps } from "../shared/types";

export function MultiSelectionDefault({ question, value, onChange }: RendererProps) {
  const selectedValues = Array.isArray(value) ? value : [];
  const hintId = `multi-hint-${question.question_key}`;
  return (
    <div className="option-list-wrap">
      <p className="multi-select-hint" id={hintId}>
        <span className="multi-select-hint__icon" aria-hidden>
          ☑
        </span>
        Choose one or more
      </p>
      <div
        className="option-list option-list--inline option-list--multi"
        role="group"
        aria-labelledby={`q-${question.question_key}`}
        aria-describedby={hintId}
      >
        {question.options.map((option) => {
          const isSelected = selectedValues.includes(option.value);
          return (
            <button
              className={`option-button ${isSelected ? "option-button--selected option-button--multi-selected" : ""}`}
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                onChange(
                  isSelected
                    ? selectedValues.filter((selectedValue) => selectedValue !== option.value)
                    : [...selectedValues, option.value],
                );
              }}
            >
              {isSelected ? (
                <span aria-hidden className="option-button__check">
                  ✓
                </span>
              ) : null}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

