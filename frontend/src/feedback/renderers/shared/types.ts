import type { AnswerValue, PublicQuestion } from "../../../types/publicFeedback";
import type { SurveyPresentation } from "../../../types/surveyPresentation";

export type RendererTheme = Record<string, string>;

export type RendererProps = {
  question: PublicQuestion;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  presentation: SurveyPresentation;
  theme: RendererTheme;
};

