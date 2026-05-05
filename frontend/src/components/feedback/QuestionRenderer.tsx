import type { ReactNode } from "react";

import type { AnswerValue, PublicQuestion } from "../../types/publicFeedback";
import type { SurveyPresentation } from "../../types/surveyPresentation";

const SHORT_TEXT_MAX = 2048;
const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function textFormatError(question: PublicQuestion, value: AnswerValue | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const s = value.trim();
  if (s.length === 0) {
    return null;
  }
  switch (question.question_type) {
    case "short_text":
      return s.length > SHORT_TEXT_MAX ? `Please keep answers under ${SHORT_TEXT_MAX} characters.` : null;
    case "email":
      return SIMPLE_EMAIL_RE.test(s) ? null : "Enter a valid email address.";
    case "phone": {
      const digits = s.replace(/\D/g, "");
      if (!/^[\d\s+().\-]+$/.test(s)) {
        return "Use only digits, spaces, parentheses, dots, dashes, and +.";
      }
      if (digits.length < 8 || digits.length > 15) {
        return "Enter a phone number with 8–15 digits.";
      }
      return null;
    }
    default:
      return null;
  }
}

export function validateQuestionAnswer(
  question: PublicQuestion,
  value: AnswerValue | undefined,
): string | null {
  const isEmptyString = typeof value === "string" && value.trim().length === 0;
  const isEmptyOptionalArray = Array.isArray(value) && value.length === 0;

  if (!question.is_required) {
    if (value === undefined || isEmptyString || isEmptyOptionalArray) {
      return null;
    }
    return textFormatError(question, value);
  }

  if (value === undefined) {
    return "Please answer this question.";
  }

  if (Array.isArray(value) && value.length === 0) {
    return "Please choose at least one option.";
  }

  if (typeof value === "string" && isEmptyString) {
    return "Please enter a response.";
  }

  return textFormatError(question, value) ?? null;
}

const DEFAULT_EMOJI_5_LABELS = ["Very Poor", "Poor", "Fair", "Good", "Excellent"] as const;
const DEFAULT_EMOJI_4_LABELS = ["Poor", "Fair", "Good", "Excellent"] as const;

const EMOJI_FACE_5 = ["😡", "😞", "😐", "😊", "😍"] as const;
const EMOJI_FACE_4 = ["😞", "😕", "🙂", "😄"] as const;

function sortQuestionOptions(question: PublicQuestion) {
  return [...question.options].sort((a, b) => a.sort_order - b.sort_order);
}

function emojiCaptionRow(
  question: PublicQuestion,
  count: number,
  defaults: readonly string[],
): string[] {
  const opts = sortQuestionOptions(question);
  if (opts.length === count) {
    return opts.map((option) => option.label);
  }
  return [...defaults];
}

function EmojiRatingInput({
  question,
  value,
  onChange,
  emojis,
  defaults,
  appearance = "default",
}: {
  question: PublicQuestion;
  value: AnswerValue | undefined;
  onChange: (next: number) => void;
  emojis: readonly string[];
  defaults: readonly string[];
  appearance?: "default" | "csat";
}) {
  const labels = emojiCaptionRow(question, emojis.length, defaults);
  return (
    <div
      className={`emoji-scale ${appearance === "csat" ? "emoji-scale--csat" : ""}`}
      role="group"
      aria-labelledby={`q-${question.question_key}`}
    >
      <div className="emoji-scale-row">
        {emojis.map((symbol, index) => {
          const score = index + 1;
          return (
            <button
              className={`emoji-scale-button ${value === score ? "emoji-scale-button--selected" : ""}`}
              key={score}
              type="button"
              onClick={() => onChange(score)}
            >
              <span aria-hidden className="emoji-scale-glyph">
                {symbol}
              </span>
              <span className="emoji-scale-caption">{labels[index]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** CSAT binary: value 2 = Yes, 1 = No (display Yes / thumbs-up first). */
function CsatBinaryThumbsYesNoInput({
  value,
  onChange,
}: {
  value: AnswerValue | undefined;
  onChange: (next: number) => void;
}) {
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

function NpsNumericInput({
  value,
  onChange,
}: {
  value: AnswerValue | undefined;
  onChange: (next: number) => void;
}) {
  return (
    <div className="nps-scale nps-scale--heatmap">
      <div className="nps-options nps-options--heatmap" role="radiogroup" aria-label="Likelihood score 0–10">
        {Array.from({ length: 11 }, (_, score) => (
          <button
            aria-checked={value === score}
            className={`nps-heatmap-cell nps-heatmap-cell--s${score} ${value === score ? "nps-heatmap-cell--selected" : ""}`}
            key={score}
            role="radio"
            type="button"
            onClick={() => onChange(score)}
          >
            <span className="nps-heatmap-cell-label">{score}</span>
          </button>
        ))}
      </div>
      <div className="scale-labels scale-labels--heatmap-nps">
        <span>Not at all likely</span>
        <span>Extremely likely</span>
      </div>
    </div>
  );
}

const NPS_SEGMENTS: Array<{ label: string; scores: readonly number[] }> = [
  { label: "Not likely", scores: [0, 1, 2, 3, 4, 5, 6] },
  { label: "Neutral", scores: [7, 8] },
  { label: "Very likely", scores: [9, 10] },
];

function NpsSegmentedInput({
  value,
  onChange,
}: {
  value: AnswerValue | undefined;
  onChange: (next: number) => void;
}) {
  return (
    <div className="nps-scale nps-scale--segmented" role="group">
      <div className="nps-segments">
        {NPS_SEGMENTS.map((segment) => (
          <div className="nps-segment" key={segment.label}>
            <div className="nps-segment-label">{segment.label}</div>
            <div className="nps-segment-scores">
              {segment.scores.map((score) => (
                <button
                  className={`scale-button scale-button--segment ${value === score ? "scale-button--selected" : ""}`}
                  key={score}
                  type="button"
                  onClick={() => onChange(score)}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="scale-labels">
        <span>Not at all likely</span>
        <span>Extremely likely</span>
      </div>
    </div>
  );
}

function CsatNumericInput({
  max,
  value,
  onChange,
}: {
  max: number;
  value: AnswerValue | undefined;
  onChange: (next: number) => void;
}) {
  const scores = Array.from({ length: max }, (_, index) => index + 1);
  return (
    <div className="nps-scale">
      <div className="nps-options">
        {scores.map((score) => (
          <button
            className={`scale-button ${value === score ? "scale-button--selected" : ""}`}
            key={score}
            type="button"
            onClick={() => onChange(score)}
          >
            {score}
          </button>
        ))}
      </div>
      <div className="scale-labels">
        <span>Poor</span>
        <span>Excellent</span>
      </div>
    </div>
  );
}

function CsatStarsInput({
  max,
  value,
  onChange,
}: {
  max: number;
  value: AnswerValue | undefined;
  onChange: (next: number) => void;
}) {
  const selected = typeof value === "number" ? value : 0;
  const scores = Array.from({ length: max }, (_, index) => index + 1);
  return (
    <div className="csat-stars" role="radiogroup" aria-label="Rating">
      {scores.map((score) => (
        <button
          className={`csat-star-btn ${selected >= score ? "csat-star-btn--selected" : ""}`}
          key={score}
          type="button"
          aria-checked={selected === score}
          role="radio"
          onClick={() => onChange(score)}
        >
          <span aria-hidden className="csat-star-glyph">
            {selected >= score ? "★" : "☆"}
          </span>
        </button>
      ))}
    </div>
  );
}

function CsatColorScaleInput({
  max,
  value,
  onChange,
}: {
  max: number;
  value: AnswerValue | undefined;
  onChange: (next: number) => void;
}) {
  const scores = Array.from({ length: max }, (_, index) => index + 1);
  return (
    <div className="csat-color-scale" role="radiogroup" aria-label="Rating">
      {scores.map((score) => (
        <button
          className={`csat-color-scale-btn csat-color-scale-btn--${max} csat-color-scale-btn--i${score} ${
            value === score ? "csat-color-scale-btn--selected" : ""
          }`}
          key={score}
          type="button"
          aria-checked={value === score}
          role="radio"
          onClick={() => onChange(score)}
        >
          {score}
        </button>
      ))}
    </div>
  );
}

function CsatBinaryYesNoInput({
  value,
  onChange,
}: {
  value: AnswerValue | undefined;
  onChange: (next: number) => void;
}) {
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

function renderCsat5(
  question: PublicQuestion,
  presentation: SurveyPresentation,
  value: AnswerValue | undefined,
  onChange: (value: AnswerValue) => void,
): ReactNode {
  switch (presentation.csat_5.renderer) {
    case "stars":
      return <CsatStarsInput max={5} onChange={onChange} value={value} />;
    case "emoji_5":
      return (
        <EmojiRatingInput
          appearance="csat"
          defaults={DEFAULT_EMOJI_5_LABELS}
          emojis={EMOJI_FACE_5}
          onChange={onChange}
          question={question}
          value={value}
        />
      );
    case "color_scale":
      return <CsatColorScaleInput max={5} onChange={onChange} value={value} />;
    default:
      return <CsatNumericInput max={5} onChange={onChange} value={value} />;
  }
}

function renderCsat4(
  question: PublicQuestion,
  presentation: SurveyPresentation,
  value: AnswerValue | undefined,
  onChange: (value: AnswerValue) => void,
): ReactNode {
  switch (presentation.csat_4.renderer) {
    case "stars":
      return <CsatStarsInput max={4} onChange={onChange} value={value} />;
    case "emoji_4":
      return (
        <EmojiRatingInput
          appearance="csat"
          defaults={DEFAULT_EMOJI_4_LABELS}
          emojis={EMOJI_FACE_4}
          onChange={onChange}
          question={question}
          value={value}
        />
      );
    case "color_scale":
      return <CsatColorScaleInput max={4} onChange={onChange} value={value} />;
    default:
      return <CsatNumericInput max={4} onChange={onChange} value={value} />;
  }
}

function renderCsat2(
  _question: PublicQuestion,
  presentation: SurveyPresentation,
  value: AnswerValue | undefined,
  onChange: (value: AnswerValue) => void,
): ReactNode {
  switch (presentation.csat_2.renderer) {
    case "thumbs":
    case "emoji_2":
      return <CsatBinaryThumbsYesNoInput onChange={onChange} value={value} />;
    case "yes_no":
      return <CsatBinaryYesNoInput onChange={onChange} value={value} />;
    default:
      return <CsatNumericInput max={2} onChange={onChange} value={value} />;
  }
}

export function QuestionRenderer({
  question,
  presentation,
  value,
  onChange,
}: {
  question: PublicQuestion;
  presentation: SurveyPresentation;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
}) {
  if (question.question_type === "nps") {
    if (presentation.nps.presentation === "segmented") {
      return <NpsSegmentedInput onChange={onChange} value={value} />;
    }
    return <NpsNumericInput onChange={onChange} value={value} />;
  }

  if (question.question_type === "csat_5") {
    return renderCsat5(question, presentation, value, onChange);
  }

  if (question.question_type === "csat_4") {
    return renderCsat4(question, presentation, value, onChange);
  }

  if (question.question_type === "csat_2") {
    return renderCsat2(question, presentation, value, onChange);
  }

  if (question.question_type === "dropdown") {
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

  if (question.question_type === "single_selection") {
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

  if (question.question_type === "multi_selection") {
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

  if (question.question_type === "short_text") {
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

  if (question.question_type === "phone") {
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

  if (question.question_type === "email") {
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
