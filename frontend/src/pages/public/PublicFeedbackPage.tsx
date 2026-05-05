import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { fetchPublicFeedbackContext, submitPublicFeedback } from "../../lib/publicFeedbackApi";
import type {
  AnswerValue,
  PublicFeedbackContext,
  PublicQuestion,
  SubmitAnswer,
} from "../../types/publicFeedback";

type ViewState = "loading" | "ready" | "submitted" | "error";

function getChannelCodeFromPath(): string {
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments[0] === "f" && segments[1]) {
    return segments[1];
  }
  return segments[0] ?? "";
}

export function PublicFeedbackPage() {
  const [context, setContext] = useState<PublicFeedbackContext | null>(null);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [thankYouText, setThankYouText] = useState<string | null>(null);
  const [resetSeconds, setResetSeconds] = useState(5);

  const channelCode = useMemo(getChannelCodeFromPath, []);
  const isKioskMode = useMemo(() => new URLSearchParams(window.location.search).get("kiosk") === "1", []);

  useEffect(() => {
    let isMounted = true;

    async function loadContext() {
      if (!channelCode) {
        setSubmitError("This feedback link is missing its channel code.");
        setViewState("error");
        return;
      }

      try {
        const nextContext = await fetchPublicFeedbackContext(channelCode);
        if (!isMounted) {
          return;
        }
        setContext(nextContext);
        setViewState("ready");
      } catch (error) {
        if (isMounted) {
          setSubmitError(error instanceof Error ? error.message : "Something went wrong.");
          setViewState("error");
        }
      }
    }

    loadContext();
    return () => {
      isMounted = false;
    };
  }, [channelCode]);

  useEffect(() => {
    if (!context) {
      return;
    }

    if (context.branding.primary_color) {
      document.documentElement.style.setProperty(
        "--color-tenant-primary",
        context.branding.primary_color,
      );
    } else {
      document.documentElement.style.removeProperty("--color-tenant-primary");
    }

    if (context.branding.secondary_color) {
      document.documentElement.style.setProperty(
        "--color-tenant-secondary",
        context.branding.secondary_color,
      );
    } else {
      document.documentElement.style.removeProperty("--color-tenant-secondary");
    }
  }, [context]);

  useEffect(() => {
    if (viewState !== "submitted" || !isKioskMode) {
      return;
    }

    setResetSeconds(5);
    const intervalId = window.setInterval(() => {
      setResetSeconds((currentSeconds) => {
        if (currentSeconds <= 1) {
          window.clearInterval(intervalId);
          setAnswers({});
          setQuestionIndex(0);
          setThankYouText(null);
          setViewState("ready");
          return 5;
        }
        return currentSeconds - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isKioskMode, viewState]);

  if (viewState === "loading") {
    return <LoadingState />;
  }

  if (viewState === "error" || !context) {
    return (
      <PublicShell>
        <StatePanel
          tone="error"
          title="Something went wrong"
          body={submitError || "Your response was not saved. Please try again."}
          actionLabel="Retry"
          onAction={() => window.location.reload()}
        />
      </PublicShell>
    );
  }

  if (viewState === "submitted") {
    return (
      <PublicShell>
        <StatePanel
          tone="success"
          title="Thank you"
          body={thankYouText || context.branding.thank_you_text}
          helperText={isKioskMode ? `This screen resets in ${resetSeconds}s.` : undefined}
        />
      </PublicShell>
    );
  }

  const currentQuestion = context.questions[questionIndex];
  const isLastQuestion = questionIndex === context.questions.length - 1;
  const progressWidth = `${((questionIndex + 1) / context.questions.length) * 100}%`;

  function updateAnswer(questionKey: string, value: AnswerValue) {
    setAnswers((currentAnswers) => ({ ...currentAnswers, [questionKey]: value }));
    setFieldError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentQuestion || !context) {
      return;
    }

    const validationError = validateQuestionAnswer(currentQuestion, answers[currentQuestion.question_key]);
    if (validationError) {
      setFieldError(validationError);
      return;
    }

    if (!isLastQuestion) {
      setQuestionIndex((currentIndex) => currentIndex + 1);
      setFieldError(null);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const submitAnswers: SubmitAnswer[] = context.questions
        .filter((question) => answers[question.question_key] !== undefined)
        .map((question) => ({
          question_key: question.question_key,
          value: answers[question.question_key],
        }));
      const response = await submitPublicFeedback(channelCode, {
        locale: context.survey.default_locale,
        answers: submitAnswers,
        metadata: {
          source: "public-web",
          location_id: context.location.id,
        },
      });
      setThankYouText(response.thank_you_text);
      setViewState("submitted");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Your response was not saved.");
      setViewState("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PublicShell>
      <form className="public-card" onSubmit={handleSubmit}>
        <div className="public-progress">
          <div
            className="public-progress-value"
            style={{ "--progress-width": progressWidth } as CSSProperties}
          />
        </div>
        <header className="public-header">
          <TenantLogo context={context} />
          <h1 className="public-title">{context.survey.title}</h1>
          <p className="public-subtitle">{context.location.name}</p>
        </header>
        <main className="public-body">
          <p className="question-kicker">
            Question {questionIndex + 1} of {context.questions.length}
          </p>
          <h2 className="question-title">{currentQuestion.prompt}</h2>
          {currentQuestion.help_text ? (
            <p className="question-help">{currentQuestion.help_text}</p>
          ) : null}
          <div className="answer-area">
            <QuestionInput
              question={currentQuestion}
              value={answers[currentQuestion.question_key]}
              onChange={(value) => updateAnswer(currentQuestion.question_key, value)}
            />
            {fieldError ? <div className="public-error">{fieldError}</div> : null}
          </div>
        </main>
        <footer className="public-footer">
          {questionIndex > 0 ? (
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => {
                setQuestionIndex((currentIndex) => currentIndex - 1);
                setFieldError(null);
              }}
            >
              Back
            </button>
          ) : null}
          <button className="btn btn--tenant" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting" : isLastQuestion ? "Submit" : "Next"}
          </button>
        </footer>
      </form>
      <p className="public-powered">Powered by goliSoda</p>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: ReactNode }) {
  return <div className="public-shell">{children}</div>;
}

function TenantLogo({ context }: { context: PublicFeedbackContext }) {
  if (context.branding.logo_url) {
    return <img className="tenant-logo" src={context.branding.logo_url} alt="" />;
  }

  const initial = context.survey.title.trim().slice(0, 1).toUpperCase() || "G";
  return <div className="tenant-logo-fallback">{initial}</div>;
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: PublicQuestion;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
}) {
  if (question.question_type === "nps") {
    return (
      <div className="nps-scale">
        <div className="nps-options">
          {Array.from({ length: 11 }, (_, score) => (
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
          <span>Not at all</span>
          <span>Extremely</span>
        </div>
      </div>
    );
  }

  if (question.question_type === "csat") {
    return (
      <div className="nps-scale">
        <div className="nps-options">
          {[1, 2, 3, 4, 5].map((score) => (
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
      <div className="option-list">
        {question.options.map((option) => (
          <button
            className={`option-button ${
              value === option.value ? "option-button--selected" : ""
            }`}
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
    return (
      <div className="option-list">
        {question.options.map((option) => {
          const isSelected = selectedValues.includes(option.value);
          return (
            <button
              className={`option-button ${isSelected ? "option-button--selected" : ""}`}
              key={option.value}
              type="button"
              onClick={() => {
                onChange(
                  isSelected
                    ? selectedValues.filter((selectedValue) => selectedValue !== option.value)
                    : [...selectedValues, option.value],
                );
              }}
            >
              {option.label}
            </button>
          );
        })}
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

function validateQuestionAnswer(question: PublicQuestion, value: AnswerValue | undefined): string | null {
  if (!question.is_required) {
    return null;
  }

  if (value === undefined) {
    return "Please answer this question.";
  }

  if (Array.isArray(value) && value.length === 0) {
    return "Please choose at least one option.";
  }

  if (typeof value === "string" && value.trim().length === 0) {
    return "Please enter a response.";
  }

  return null;
}

function StatePanel({
  tone,
  title,
  body,
  helperText,
  actionLabel,
  onAction,
}: {
  tone: "success" | "error";
  title: string;
  body: string;
  helperText?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="public-card">
      <div className="state-panel">
        <div className={`state-icon ${tone === "error" ? "state-icon--error" : ""}`}>
          {tone === "success" ? "✓" : "!"}
        </div>
        <h1 className="state-title">{title}</h1>
        <p className="state-body">{body}</p>
        {helperText ? <p className="state-helper">{helperText}</p> : null}
        {actionLabel && onAction ? (
          <button className="btn btn--tenant" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <PublicShell>
      <div className="public-card loading-card">
        <div className="skeleton loading-header" />
        <div className="skeleton loading-title" />
        <div className="skeleton loading-option" />
        <div className="skeleton loading-option" />
        <div className="skeleton loading-option" />
      </div>
    </PublicShell>
  );
}
