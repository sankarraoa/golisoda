import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { QuestionRenderer } from "./QuestionRenderer";
import { normalizeSurveyPresentation } from "../../types/surveyPresentation";
import type { PublicQuestion } from "../../types/publicFeedback";

const baseQuestion = (overrides: Partial<PublicQuestion>): PublicQuestion =>
  ({
    id: "q",
    question_key: "q",
    question_type: "plain_text",
    prompt: "Prompt",
    help_text: null,
    is_required: true,
    is_pii: false,
    sort_order: 0,
    options: [],
    ...overrides,
  }) as PublicQuestion;

describe("QuestionRenderer dispatcher", () => {
  it("nps with no override picks :default (numeric)", () => {
    const question = baseQuestion({ question_type: "nps" });
    const presentation = normalizeSurveyPresentation({}); // default is numeric NPS
    const { container } = render(
      <QuestionRenderer onChange={() => {}} presentation={presentation} question={question} theme={{}} value={undefined} />,
    );
    expect(container.querySelector(".nps-scale--heatmap")).toBeTruthy();
  });

  it("nps segmented picks :segmented", () => {
    const question = baseQuestion({ question_type: "nps" });
    const presentation = normalizeSurveyPresentation({ nps: { presentation: "segmented" } });
    const { container } = render(
      <QuestionRenderer onChange={() => {}} presentation={presentation} question={question} theme={{}} value={undefined} />,
    );
    expect(container.querySelector(".nps-scale--segmented")).toBeTruthy();
  });

  it("csat_5 picks each renderer value", () => {
    const question = baseQuestion({ question_type: "csat_5" });

    const stars = normalizeSurveyPresentation({ csat_5: { renderer: "stars" } });
    expect(render(<QuestionRenderer onChange={() => {}} presentation={stars} question={question} theme={{}} value={2} />).container.querySelector(".csat-stars")).toBeTruthy();

    const emoji = normalizeSurveyPresentation({ csat_5: { renderer: "emoji_5" } });
    expect(render(<QuestionRenderer onChange={() => {}} presentation={emoji} question={question} theme={{}} value={2} />).container.querySelector(".emoji-scale--csat")).toBeTruthy();

    const color = normalizeSurveyPresentation({ csat_5: { renderer: "color_scale" } });
    expect(render(<QuestionRenderer onChange={() => {}} presentation={color} question={question} theme={{}} value={2} />).container.querySelector(".csat-color-scale")).toBeTruthy();

    const numeric = normalizeSurveyPresentation({ csat_5: { renderer: "numeric" } });
    expect(render(<QuestionRenderer onChange={() => {}} presentation={numeric} question={question} theme={{}} value={2} />).container.querySelector(".scale-button")).toBeTruthy();
  });

  it("csat_2 yes_no picks :yes_no", () => {
    const question = baseQuestion({ question_type: "csat_2" });
    const presentation = normalizeSurveyPresentation({ csat_2: { renderer: "yes_no" } });
    const { container } = render(
      <QuestionRenderer onChange={() => {}} presentation={presentation} question={question} theme={{}} value={2} />,
    );
    expect(container.querySelector(".csat-yes-no")).toBeTruthy();
  });

  it("short_text picks :default", () => {
    const question = baseQuestion({ question_type: "short_text" });
    const presentation = normalizeSurveyPresentation({});
    const { container } = render(
      <QuestionRenderer onChange={() => {}} presentation={presentation} question={question} theme={{}} value={"x"} />,
    );
    expect(container.querySelector("input.field-input[type=\"text\"]")).toBeTruthy();
  });

  it("legacy csat block normalization still routes correctly", () => {
    const question = baseQuestion({ question_type: "csat_5" });
    const normalized = normalizeSurveyPresentation({ csat: { presentation: "digits" } });
    const { container } = render(
      <QuestionRenderer onChange={() => {}} presentation={normalized} question={question} theme={{}} value={3} />,
    );
    // digits maps to emoji_5 in normalizeSurveyPresentation
    expect(container.querySelector(".emoji-scale--csat")).toBeTruthy();
  });
});

