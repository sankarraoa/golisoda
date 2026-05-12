import type { AnswerValue, PublicQuestion } from "../../../types/publicFeedback";
import { SHORT_TEXT_MAX, SIMPLE_EMAIL_RE } from "./constants";

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

export function validateQuestionAnswer(question: PublicQuestion, value: AnswerValue | undefined): string | null {
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

