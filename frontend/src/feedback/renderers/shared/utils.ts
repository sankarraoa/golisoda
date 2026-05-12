import type { PublicQuestion } from "../../../types/publicFeedback";

export function sortQuestionOptions(question: PublicQuestion) {
  return [...question.options].sort((a, b) => a.sort_order - b.sort_order);
}

