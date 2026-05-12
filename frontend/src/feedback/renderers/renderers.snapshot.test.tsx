import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import type { PublicQuestion } from "../../types/publicFeedback";
import { normalizeSurveyPresentation } from "../../types/surveyPresentation";
import { QuestionRenderer } from "../../components/feedback/QuestionRenderer";

const q = (overrides: Partial<PublicQuestion>): PublicQuestion =>
  ({
    id: "q",
    question_key: "q",
    question_type: "plain_text",
    prompt: "Prompt",
    help_text: "Help",
    is_required: true,
    is_pii: false,
    sort_order: 0,
    options: [],
    ...overrides,
  }) as PublicQuestion;

describe("renderer snapshots (byte-stable DOM)", () => {
  it("nps numeric", () => {
    const { container } = render(
      <QuestionRenderer
        question={q({ question_type: "nps" })}
        presentation={normalizeSurveyPresentation({ nps: { presentation: "numeric" } })}
        value={9}
        onChange={() => {}}
        theme={{}}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("csat_5 emoji_5", () => {
    const { container } = render(
      <QuestionRenderer
        question={q({ question_type: "csat_5" })}
        presentation={normalizeSurveyPresentation({ csat_5: { renderer: "emoji_5" } })}
        value={3}
        onChange={() => {}}
        theme={{}}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("dropdown", () => {
    const { container } = render(
      <QuestionRenderer
        question={q({
          question_type: "dropdown",
          options: [
            { id: "1", value: "a", label: "A", sort_order: 0 },
            { id: "2", value: "b", label: "B", sort_order: 1 },
          ],
        })}
        presentation={normalizeSurveyPresentation({})}
        value={"a"}
        onChange={() => {}}
        theme={{}}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("plain_text", () => {
    const { container } = render(
      <QuestionRenderer
        question={q({ question_type: "plain_text" })}
        presentation={normalizeSurveyPresentation({})}
        value={"hello"}
        onChange={() => {}}
        theme={{}}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});

