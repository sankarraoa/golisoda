import type { ComponentType } from "react";

import type { AnswerValue, PublicQuestion } from "../../types/publicFeedback";
import type { SurveyPresentation } from "../../types/surveyPresentation";
import { rendererRegistry } from "../../feedback/renderers/registry";
import type { RendererTheme } from "../../feedback/renderers/shared/types";
export { validateQuestionAnswer } from "../../feedback/renderers/shared/validation";

function getVariant(question: PublicQuestion, presentation: SurveyPresentation): string {
  if (question.question_type === "nps") {
    return presentation.nps.presentation ?? "default";
  }
  const p: any = presentation as any;
  const block = p?.[question.question_type];
  return (block?.renderer as string | undefined) ?? "default";
}

export function QuestionRenderer({
  question,
  presentation,
  value,
  onChange,
  theme = {},
}: {
  question: PublicQuestion;
  presentation: SurveyPresentation;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  theme?: RendererTheme;
}) {
  const type = question.question_type;
  const variant = getVariant(question, presentation) || "default";
  const key = `${type}:${variant}`;
  const fallbackKey = `${type}:default`;

  const Component =
    (rendererRegistry[key] ?? rendererRegistry[fallbackKey]) as ComponentType<any> | undefined;

  if (!Component) {
    if (import.meta.env.DEV) {
      return <div style={{ padding: 12, border: "2px solid red" }}>Missing renderer: {key}</div>;
    }
    console.error("Missing renderer", key);
    return null;
  }

  return <Component onChange={onChange} presentation={presentation} question={question} theme={theme} value={value} />;
}
