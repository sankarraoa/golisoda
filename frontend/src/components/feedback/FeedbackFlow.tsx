import { FormEvent, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import type {
  AnswerValue,
  PublicBranding,
  PublicOrganization,
  PublicQuestion,
  SubmitAnswer,
} from "../../types/publicFeedback";
import { formatPublicOrganizationAddressLines } from "../../types/publicFeedback";
import type { SurveyPresentation } from "../../types/surveyPresentation";
import { resolveImmersiveHeroImageUrls } from "../../lib/heritageImmersiveHeroUrls";
import { canonicalTemplateSlug, isHeritageImmersiveFamilySlug } from "../../lib/templateSlug";
import { getPublicFeedbackApiBase } from "../../lib/publicFeedbackApi";
import { FeedbackHeader, FeedbackProgress, FeedbackShell } from "./FeedbackShell";
import { QuestionRenderer, validateQuestionAnswer } from "./QuestionRenderer";

function TenantLogoFeedback({
  branding,
  surveyTitle,
  logoFallback = "initial",
}: {
  branding: PublicBranding;
  surveyTitle: string;
  /** Kiosk uses a storefront glyph when no logo is uploaded so the header still reads as the organization. */
  logoFallback?: "initial" | "org-symbol";
}) {
  if (branding.logo_url) {
    return <img className="tenant-logo" src={branding.logo_url} alt="" />;
  }

  if (logoFallback === "org-symbol") {
    return (
      <div className="tenant-logo-fallback tenant-logo-fallback--org-icon" aria-hidden="true">
        <span className="material-symbols-outlined">storefront</span>
      </div>
    );
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
  templateId,
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
  /** Survey template row id — used to resolve `package.immersive.hero_asset_paths` under `/public/template-assets/{id}/`. */
  templateId?: string;
}) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const layout = presentation.layout;
  const sortedQuestions = [...questions].sort((a, b) => a.sort_order - b.sort_order);
  const currentQuestion = sortedQuestions[questionIndex];
  const templateKey = canonicalTemplateSlug(templateSlug);
  const heritageImmersiveFamily = isHeritageImmersiveFamilySlug(templateSlug);
  const flowLayout: "stepper" | "single_page" = heritageImmersiveFamily ? "stepper" : layout;
  const flowPresentation: SurveyPresentation =
    heritageImmersiveFamily
      ? {
          ...presentation,
          layout: "stepper",
          progress: { ...presentation.progress, style: "dots" },
        }
      : presentation;
  const heroUrlPool = useMemo(
    () =>
      resolveImmersiveHeroImageUrls(templateId, getPublicFeedbackApiBase(), flowPresentation.package?.immersive),
    [templateId, flowPresentation.package?.immersive],
  );
  const heritageImmersiveMiddleClass =
    flowPresentation.package?.immersive?.hero_column === "start"
      ? "heritage-immersive-middle heritage-immersive-middle--hero-start"
      : "heritage-immersive-middle";
  const heritageQuestionSignature = useMemo(
    () =>
      [...questions]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((q) => q.question_key)
        .join("\0"),
    [questions],
  );
  const heritageImmersiveHeroPick = useMemo(() => {
    if (!heritageImmersiveFamily) {
      return { perStep: null as string[] | null, single: null as string | null };
    }
    const pool = heroUrlPool;
    const n = pool.length;
    const len = sortedQuestions.length;
    if (len === 0) {
      return { perStep: null, single: pool[0] };
    }
    if (flowLayout === "stepper") {
      return {
        perStep: Array.from({ length: len }, () => pool[Math.floor(Math.random() * n)]),
        single: null,
      };
    }
    return {
      perStep: null,
      single: pool[Math.floor(Math.random() * n)],
    };
  }, [heritageImmersiveFamily, heroUrlPool, flowLayout, heritageQuestionSignature, sortedQuestions.length]);
  const heritageImmersiveHeroSrc =
    flowLayout === "stepper"
      ? (heritageImmersiveHeroPick.perStep?.[questionIndex] ??
          heritageImmersiveHeroPick.perStep?.[0] ??
          heroUrlPool[0])
      : (heritageImmersiveHeroPick.single ?? heroUrlPool[0]);
  const isPreview = onSubmitAnswers === null || channelCode === null;
  const isLastQuestion = flowLayout === "stepper" && questionIndex === sortedQuestions.length - 1;

  function updateAnswer(questionKey: string, value: AnswerValue) {
    setAnswers((currentAnswers) => ({ ...currentAnswers, [questionKey]: value }));
    setFieldError(null);
  }

  useEffect(() => {
    if (flowLayout !== "stepper" || !presentation.navigation.auto_advance || !currentQuestion) {
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
  }, [answers, currentQuestion, flowLayout, presentation.navigation.auto_advance, questionIndex, sortedQuestions.length]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (flowLayout === "single_page") {
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
    flowLayout === "stepper" ? (
      <FeedbackProgress
        presentation={flowPresentation}
        questionIndex={questionIndex}
        totalQuestions={sortedQuestions.length}
      />
    ) : flowPresentation.progress.style !== "none" ? (
      <div className="public-progress">
        <div className="public-progress-value" style={{ width: "100%" } as CSSProperties} />
      </div>
    ) : null;

  const kioskSubmitPhrase = templateKey === "kiosk_touch" ? "Submit Feedback" : "Submit";

  const heritageLuxuryClosing = surveyDescription?.trim() || "Thank you!";

  const footerSubmitLabel = isSubmitting
    ? "Submitting"
    : flowLayout === "single_page"
      ? onSubmitAnswers
        ? kioskSubmitPhrase
        : "Preview"
      : isPreview && isLastQuestion
        ? kioskSubmitPhrase
        : isLastQuestion
          ? kioskSubmitPhrase
          : "Next";

  const backButton =
    flowLayout === "stepper" && questionIndex > 0 && !disableStepBack ? (
      <button
        className="btn btn--ghost heritage-immersive-back"
        type="button"
        onClick={() => {
          setQuestionIndex((currentIndex) => currentIndex - 1);
          setFieldError(null);
        }}
      >
        Back
      </button>
    ) : null;

  const orgAddressLines = formatPublicOrganizationAddressLines(organization);

  const progressForShell = heritageImmersiveFamily ? null : progressNode;

  const footer =
    heritageImmersiveFamily ? (
      <footer className="public-footer heritage-immersive-footer">
        <div className="heritage-immersive-footer-actions">
          <div className="heritage-immersive-footer-start">
            {backButton ?? <span className="heritage-immersive-footer-slot" aria-hidden />}
          </div>
          <div className="heritage-immersive-footer-center">
            {previewBadge ? (
              <span className="heritage-immersive-preview-badge text-secondary text-sm">{previewBadge}</span>
            ) : null}
          </div>
          <div className="heritage-immersive-footer-end">
            <button
              className="btn btn--tenant heritage-immersive-submit"
              disabled={isSubmitting || sortedQuestions.length === 0}
              type="submit"
            >
              {footerSubmitLabel}
            </button>
          </div>
        </div>
      </footer>
    ) : templateKey === "heritage_luxury" ? (
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
            {templateKey === "heritage_luxury" || footerSubmitLabel === "Submitting" ? null : (
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
  if (flowLayout === "single_page") {
    if (heritageImmersiveFamily) {
      mainBody = (
        <div className={heritageImmersiveMiddleClass}>
          <div className="heritage-immersive-question-col">
            <div className="heritage-immersive-question-scroll public-body public-body--single-page">
              <p className="heritage-immersive-context-line">{locationName}</p>
              <h1 className="heritage-immersive-survey-title">{surveyTitle}</h1>
              {sortedQuestions.map((question, index) => (
                <section className="feedback-section" key={question.question_key} id={`section-${question.question_key}`}>
                  <h2 className="question-title" id={`q-${question.question_key}`}>
                    {question.prompt}
                  </h2>
                  {question.help_text ? <p className="question-help">{question.help_text}</p> : null}
                  <div className="answer-area">
                    <QuestionRenderer
                      presentation={flowPresentation}
                      question={question}
                      value={answers[question.question_key]}
                      onChange={(value) => updateAnswer(question.question_key, value)}
                      theme={theme}
                    />
                  </div>
                </section>
              ))}
              {fieldError ? <div className="public-error">{fieldError}</div> : null}
            </div>
          </div>
          <aside className="heritage-immersive-hero-col" aria-hidden="true">
            <img
              alt=""
              className="heritage-immersive-hero-img"
              decoding="async"
              key={heritageImmersiveHeroSrc}
              src={heritageImmersiveHeroSrc}
            />
          </aside>
        </div>
      );
    } else {
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
                  presentation={flowPresentation}
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
    }
  } else if (heritageImmersiveFamily) {
    mainBody = (
      <div className={heritageImmersiveMiddleClass}>
        <div className="heritage-immersive-question-col">
          <div className="heritage-immersive-question-inner public-body">
            <FeedbackProgress
              presentation={flowPresentation}
              questionIndex={questionIndex}
              totalQuestions={sortedQuestions.length}
            />
            <p className="heritage-immersive-context-line">{locationName}</p>
            <h1 className="heritage-immersive-survey-title">{surveyTitle}</h1>
            {currentQuestion ? (
              <>
                <h2 className="question-title" id={`q-${currentQuestion.question_key}`}>
                  {currentQuestion.prompt}
                </h2>
                {currentQuestion.help_text ? <p className="question-help">{currentQuestion.help_text}</p> : null}
                <div className="answer-area">
                  <QuestionRenderer
                    presentation={flowPresentation}
                    question={currentQuestion}
                    value={answers[currentQuestion.question_key]}
                    onChange={(value) => updateAnswer(currentQuestion.question_key, value)}
                    theme={theme}
                  />
                  {fieldError ? <div className="public-error">{fieldError}</div> : null}
                </div>
              </>
            ) : null}
          </div>
        </div>
        <aside className="heritage-immersive-hero-col" aria-hidden="true">
          <img
            alt=""
            className="heritage-immersive-hero-img"
            decoding="async"
            key={heritageImmersiveHeroSrc}
            src={heritageImmersiveHeroSrc}
          />
        </aside>
      </div>
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
            {currentQuestion.help_text ? <p className="question-help">{currentQuestion.help_text}</p> : null}
            <div className="answer-area">
              <QuestionRenderer
                presentation={flowPresentation}
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
    heritageImmersiveFamily ? (
      <header className="heritage-immersive-topbar">
        <div className="heritage-immersive-brand">
          <TenantLogoFeedback branding={branding} surveyTitle={surveyTitle} />
        </div>
        <div className="heritage-immersive-address">
          {orgAddressLines.length > 0 ? (
            orgAddressLines.map((line, index) => (
              <div className="heritage-immersive-address-line" key={`${index}-${line}`}>
                {line}
              </div>
            ))
          ) : (
            <div className="heritage-immersive-address-line heritage-immersive-address-fallback">{locationName}</div>
          )}
        </div>
      </header>
    ) : templateKey === "heritage_luxury" ? (
      (() => {
        const displayName = organization.name?.trim() || surveyTitle;
        const subtitleNode =
          orgAddressLines.length > 0 ? (
            <div className="jewelry-org-address">
              {orgAddressLines.map((line, index) => (
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
        logo={
          <TenantLogoFeedback
            branding={branding}
            logoFallback={templateKey === "kiosk_touch" ? "org-symbol" : "initial"}
            surveyTitle={surveyTitle}
          />
        }
        subtitle={locationName}
        title={surveyTitle}
      />
    );

  return (
    <FeedbackShell
      branding={branding}
      footer={footer}
      header={headerNode}
      presentation={flowPresentation}
      progress={progressForShell}
      templateSlug={templateSlug}
      theme={theme}
      onSubmit={handleSubmit}
    >
      {mainBody}
    </FeedbackShell>
  );
}
