import type { SurveyQuestion } from "../../types/admin";
import type { PublicQuestion } from "../../types/publicFeedback";

export function mapSurveyQuestionToPublic(question: SurveyQuestion): PublicQuestion {
  return {
    id: question.id,
    question_key: question.question_key,
    question_type: question.question_type,
    prompt: question.prompt,
    help_text: question.help_text,
    is_required: question.is_required,
    is_pii: question.is_pii,
    sort_order: question.sort_order,
    options: question.options.map((option) => ({
      id: option.id,
      value: option.value,
      label: option.label,
      sort_order: option.sort_order,
    })),
  };
}
