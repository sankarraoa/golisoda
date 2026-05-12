import { FormEvent, useEffect, useState, type CSSProperties, type ReactNode } from "react";

import type {
  AnswerValue,
  PublicBranding,
  PublicOrganization,
  PublicQuestion,
  SubmitAnswer,
} from "../../types/publicFeedback";
import { formatPublicOrganizationAddressLines } from "../../types/publicFeedback";
import type { SurveyPresentation } from "../../types/surveyPresentation";
import { FeedbackHeader, FeedbackProgress, FeedbackShell } from "./FeedbackShell";
import { QuestionRenderer, validateQuestionAnswer } from "./QuestionRenderer";

function TenantLogoFeedback({
  branding,
  surveyTitle,
}: {
  branding: PublicBranding;
  surveyTitle: string;
}) {
  if (branding.logo_url) {
    return <img className="tenant-logo" src={branding.logo_url} alt="" />;
  }

  const initial = surveyTitle.trim().slice(0, 1).toUpperCase() || "G";
  return <div className="tenant-logo-fallback">{initial}</div>;
}

export function FeedbackFlow({
  templateSlug,
  presentation,
  questions,
  branding,
  surveyTitle,
  locationName,
  organization,
  channelCode,
  onSubmitAnswers,
  previewBadge,
  disableStepBack = false,
  surveyDescription = null,
  theme = {},
}: {
  templateSlug: string;
  presentation: SurveyPresentation;
  questions: PublicQuestion[];
  branding: PublicBranding;
  surveyTitle: string;
  locationName: string;
  /** Tenant org profile from public context; `heritage_luxury` uses it in the header. */
  organization: PublicOrganization;
  channelCode: string | null;
  defaultLocale?: string;
  onSubmitAnswers: ((answers: SubmitAnswer[]) => Promise<void>) | null;
  previewBadge?: ReactNode;
  /** When true, stepper layouts hide the footer Back control (e.g. one-way QR flows). */
  disableStepBack?: boolean;
  /** Survey description: `heritage_immersive` ornamental tagline; `heritage_luxury` (jewelry card) italic closing under Submit. */
  surveyDescription?: string | null;
  theme?: Record<string, string>;
}) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const layout = presentation.layout;
  const sortedQuestions = [...questions].sort((a, b) => a.sort_order - b.sort_order);
  const currentQuestion = sortedQuestions[questionIndex];
  const isPreview = onSubmitAnswers === null || channelCode === null;
  const isLastQuestion = layout === "stepper" && questionIndex === sortedQuestions.length - 1;

  function updateAnswer(questionKey: string, value: AnswerValue) {
    setAnswers((currentAnswers) => ({ ...currentAnswers, [questionKey]: value }));
    setFieldError(null);
  }

  useEffect(() => {
    if (layout !== "stepper" || !presentation.navigation.auto_advance || !currentQuestion) {
      return;
    }
    const val = answers[currentQuestion.question_key];
    const err = validateQuestionAnswer(currentQuestion, val);
    if (err || questionIndex >= sortedQuestions.length - 1) {
      return;
    }
    const timer = window.setTimeout(() => {
      setQuestionIndex((idx) => idx + 1);
      setFieldError(null);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [answers, currentQuestion, layout, presentation.navigation.auto_advance, questionIndex, sortedQuestions.length]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (layout === "single_page") {
      for (const q of sortedQuestions) {
        const err = validateQuestionAnswer(q, answers[q.question_key]);
        if (err) {
          setFieldError(err);
          document
            .getElementById(`section-${q.question_key}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
      }
    if (!onSubmitAnswers) {
      return;
    }
    setIsSubmitting(true);
    setFieldError(null);
    try {
      const payload: SubmitAnswer[] = sortedQuestions
        .filter((question) => answers[question.question_key] !== undefined)
        .map((question) => ({
          question_key: question.question_key,
          value: answers[question.question_key],
        }));
      await onSubmitAnswers(payload);
    } catch {
      /* Parent handles surfaced errors */
    } finally {
      setIsSubmitting(false);
    }
      return;
    }

    if (!currentQuestion) {
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

    if (isPreview) {
      setQuestionIndex(0);
      setAnswers({});
      setFieldError(null);
      return;
    }

    if (!onSubmitAnswers || !channelCode) {
      return;
    }

    setIsSubmitting(true);
    setFieldError(null);
    try {
      const payload: SubmitAnswer[] = sortedQuestions
        .filter((question) => answers[question.question_key] !== undefined)
        .map((question) => ({
          question_key: question.question_key,
          value: answers[question.question_key],
        }));
      await onSubmitAnswers(payload);
    } catch {
      /* Parent handles surfaced errors */
    } finally {
      setIsSubmitting(false);
    }
  }

  const progressNode =
    layout === "stepper" ? (
      <FeedbackProgress
        presentation={presentation}
        questionIndex={questionIndex}
        totalQuestions={sortedQuestions.length}
      />
    ) : presentation.progress.style !== "none" ? (
      <div className="public-progress">
        <div className="public-progress-value" style={{ width: "100%" } as CSSProperties} />
      </div>
    ) : null;

  const kioskSubmitPhrase = templateSlug === "kiosk_touch" ? "Submit Feedback" : "Submit";

  const heritageFooterTagline =
    surveyDescription?.trim() || "Your feedback helps us serve you better.";

  const heritageLuxuryClosing = surveyDescription?.trim() || "Thank you!";

  const footerSubmitLabel = isSubmitting
    ? "Submitting"
    : layout === "single_page"
      ? onSubmitAnswers
        ? kioskSubmitPhrase
        : "Preview"
      : isPreview && isLastQuestion
        ? kioskSubmitPhrase
        : isLastQuestion
          ? kioskSubmitPhrase
          : "Next";

  const backButton =
    layout === "stepper" && questionIndex > 0 && !disableStepBack ? (
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
    ) : null;

  const footer =
    templateSlug === "heritage_immersive" ? (
      <>
        <footer className="public-footer public-footer--heritage">
          <div className="heritage-footer-inner">
            <div className="heritage-footer-tagline-wrap">
              <p className="heritage-footer-tagline">{heritageFooterTagline}</p>
            </div>
            {previewBadge ? (
              <div className="heritage-footer-preview">
                <span className="text-secondary text-sm">{previewBadge}</span>
              </div>
            ) : null}
            <div className="heritage-footer-btn-row">
              {backButton}
              <button
                className={`btn btn--tenant heritage-footer-submit${backButton ? "" : " heritage-footer-submit--solo"}`}
                disabled={isSubmitting || sortedQuestions.length === 0}
                type="submit"
              >
                {footerSubmitLabel}
              </button>
            </div>
          </div>
        </footer>
        <div className="heritage-floor" aria-hidden />
      </>
    ) : templateSlug === "heritage_luxury" ? (
      <footer className="public-footer public-footer--jewelry-card">
        {previewBadge ? (
          <div className="jewelry-card-preview-note">
            <span className="text-secondary text-sm">{previewBadge}</span>
          </div>
        ) : null}
        <div className="jewelry-card-footer-submit-row">
          {backButton}
          <button
            className="btn btn--tenant jewelry-card-submit"
            disabled={isSubmitting || sortedQuestions.length === 0}
            type="submit"
          >
            {footerSubmitLabel}
            {templateSlug === "heritage_luxury" || footerSubmitLabel === "Submitting" ? null : (
              <>
                {" "}
                »
              </>
            )}
          </button>
        </div>
        <p className="jewelry-card-footer-closing">{heritageLuxuryClosing}</p>
      </footer>
    ) : (
      <footer className="public-footer">
        {backButton ?? <span />}
        {previewBadge ? <span className="text-secondary text-sm">{previewBadge}</span> : null}
        <button className="btn btn--tenant" disabled={isSubmitting || sortedQuestions.length === 0} type="submit">
          {footerSubmitLabel}
        </button>
      </footer>
    );

  let mainBody: ReactNode;
  if (layout === "single_page") {
    mainBody = (
      <main className="public-body public-body--single-page">
        {sortedQuestions.map((question, index) => (
          <section className="feedback-section" key={question.question_key} id={`section-${question.question_key}`}>
            <p className="question-kicker">
              Question {index + 1} of {sortedQuestions.length}
            </p>
            <h2 className="question-title" id={`q-${question.question_key}`}>
              {question.prompt}
            </h2>
            {question.help_text ? <p className="question-help">{question.help_text}</p> : null}
            <div className="answer-area">
              <QuestionRenderer
                presentation={presentation}
                question={question}
                value={answers[question.question_key]}
                onChange={(value) => updateAnswer(question.question_key, value)}
                theme={theme}
              />
            </div>
          </section>
        ))}
        {fieldError ? <div className="public-error">{fieldError}</div> : null}
      </main>
    );
  } else {
    mainBody = (
      <main className="public-body">
        {currentQuestion ? (
          <>
            <p className="question-kicker">
              Question {questionIndex + 1} of {sortedQuestions.length}
            </p>
            <h2 className="question-title" id={`q-${currentQuestion.question_key}`}>
              {currentQuestion.prompt}
            </h2>
            {currentQuestion.help_text ? (
              <p className="question-help">{currentQuestion.help_text}</p>
            ) : null}
            <div className="answer-area">
              <QuestionRenderer
                presentation={presentation}
                question={currentQuestion}
                value={answers[currentQuestion.question_key]}
                onChange={(value) => updateAnswer(currentQuestion.question_key, value)}
                theme={theme}
              />
              {fieldError ? <div className="public-error">{fieldError}</div> : null}
            </div>
          </>
        ) : null}
      </main>
    );
  }

  const headerNode =
    templateSlug === "heritage_immersive" ? (
      <>
        <div className="heritage-hero">
          <div className="heritage-maroon-crown">
            <div className="heritage-motif-row">
              <span className="heritage-diya heritage-diya--left" aria-hidden />
              {branding.logo_url ? (
                <img alt="" className="heritage-hero-logo" src={branding.logo_url} />
              ) : (
                <span className="heritage-motif-center" aria-hidden>
                  🛕
                </span>
              )}
              <span className="heritage-diya heritage-diya--right" aria-hidden />
            </div>
          </div>
        </div>
        <FeedbackHeader
          logo={branding.logo_url ? null : <TenantLogoFeedback branding={branding} surveyTitle={surveyTitle} />}
          subtitle={locationName}
          title={surveyTitle}
        />
      </>
    ) : templateSlug === "heritage_luxury" ? (
      (() => {
        const orgLines = formatPublicOrganizationAddressLines(organization);
        const displayName = organization.name?.trim() || surveyTitle;
        const subtitleNode =
          orgLines.length > 0 ? (
            <div className="jewelry-org-address">
              {orgLines.map((line, index) => (
                <div className="jewelry-org-address-line" key={`${index}-${line}`}>
                  {line}
                </div>
              ))}
            </div>
          ) : (
            locationName
          );
        return (
          <FeedbackHeader
            logo={<TenantLogoFeedback branding={branding} surveyTitle={surveyTitle} />}
            subtitle={subtitleNode}
            title={displayName}
          />
        );
      })()
    ) : (
      <FeedbackHeader
        logo={<TenantLogoFeedback branding={branding} surveyTitle={surveyTitle} />}
        subtitle={locationName}
        title={surveyTitle}
      />
    );

  return (
    <FeedbackShell
      footer={footer}
      header={headerNode}
      presentation={presentation}
      progress={progressNode}
      templateSlug={templateSlug}
      onSubmit={handleSubmit}
    >
      {mainBody}
    </FeedbackShell>
  );
}
