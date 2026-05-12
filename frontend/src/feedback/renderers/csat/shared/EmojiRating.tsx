import type { AnswerValue, PublicQuestion } from "../../../../types/publicFeedback";
import { sortQuestionOptions } from "../../shared/utils";

function emojiCaptionRow(question: PublicQuestion, count: number, defaults: readonly string[]): string[] {
  const opts = sortQuestionOptions(question);
  if (opts.length === count) {
    return opts.map((option) => option.label);
  }
  return [...defaults];
}

export function EmojiRating({
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

