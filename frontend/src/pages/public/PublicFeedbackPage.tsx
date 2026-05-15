import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { FeedbackFlow } from "../../components/feedback/FeedbackFlow";
import { applyBrandingCss, applyTheme } from "../../feedback/theme/applyTheme";
import { useTemplatePackStylesheets } from "../../hooks/useTemplatePackStylesheets";
import { fetchPublicFeedbackContext, getPublicFeedbackApiBase, submitPublicFeedback } from "../../lib/publicFeedbackApi";
import type { PublicFeedbackContext, SubmitAnswer } from "../../types/publicFeedback";
import { resolveSurveyPresentation } from "../../types/publicFeedback";
import { DEFAULT_SURVEY_PRESENTATION } from "../../types/surveyPresentation";
import { canonicalTemplateSlug } from "../../lib/templateSlug";

type ViewState = "loading" | "ready" | "submitted" | "error";

/** Per-channel session flag so QR/mobile users keep the thank-you message after refresh (kiosk does not use this). */
function feedbackCompleteStorageKey(channelCode: string) {
  return `goli-feedback-complete-${channelCode}`;
}

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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [thankYouText, setThankYouText] = useState<string | null>(null);
  const [resetSeconds, setResetSeconds] = useState(5);
  const [formResetKey, setFormResetKey] = useState(0);

  const channelCode = useMemo(getChannelCodeFromPath, []);
  const kioskUrlOverride = useMemo(
    () => new URLSearchParams(window.location.search).get("kiosk") === "1",
    [],
  );

  const surveyPresentation = useMemo(() => {
    if (!context) {
      return DEFAULT_SURVEY_PRESENTATION;
    }
    return resolveSurveyPresentation(context);
  }, [context]);

  useTemplatePackStylesheets(context?.template?.id, surveyPresentation, getPublicFeedbackApiBase());

  const isKioskLoop =
    context !== null && (context.channel_type === "kiosk" || kioskUrlOverride);

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
        const pageUrl = new URL(window.location.href);
        const isCompleteUrl = pageUrl.searchParams.get("complete") === "1";
        const treatAsKiosk =
          nextContext.channel_type === "kiosk" || pageUrl.searchParams.get("kiosk") === "1";

        setContext(nextContext);

        if (isCompleteUrl && !treatAsKiosk) {
          try {
            const raw = sessionStorage.getItem(feedbackCompleteStorageKey(channelCode));
            if (raw) {
              const parsed = JSON.parse(raw) as { thank_you_text?: string };
              setThankYouText(parsed.thank_you_text ?? null);
            } else {
              setThankYouText(null);
            }
          } catch {
            setThankYouText(null);
          }
          setViewState("submitted");
        } else {
          try {
            sessionStorage.removeItem(feedbackCompleteStorageKey(channelCode));
          } catch {
            /* ignore */
          }
          setThankYouText(null);
          setViewState("ready");
        }
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
    if (viewState !== "submitted" || !isKioskLoop) {
      return;
    }

    setResetSeconds(5);
    const intervalId = window.setInterval(() => {
      setResetSeconds((currentSeconds) => {
        if (currentSeconds <= 1) {
          window.clearInterval(intervalId);
          setSubmitError(null);
          setThankYouText(null);
          setFormResetKey((current) => current + 1);
          setViewState("ready");
          return 5;
        }
        return currentSeconds - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isKioskLoop, viewState]);

  useEffect(() => {
    if (viewState !== "submitted" || isKioskLoop || !context) {
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get("complete") === "1") {
      return;
    }
    url.searchParams.set("complete", "1");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [viewState, isKioskLoop, context]);

  if (viewState === "loading") {
    return <LoadingState />;
  }

  if (!context) {
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

  const presentation = surveyPresentation;
  const templateSlug = context.template?.slug ?? "default_stepper";
  const shellProps = {
    templateSlug,
    largeTargets: presentation.touch.large_targets,
    theme: context.effective_theme ?? {},
    branding: {
      primary_color: context.branding.primary_color,
      secondary_color: context.branding.secondary_color,
    },
  };

  if (viewState === "error") {
    return (
      <PublicShell {...shellProps}>
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
    const thankBody = thankYouText || context.branding.thank_you_text;
    const kioskHelper = isKioskLoop ? `Next person in ${resetSeconds}s.` : undefined;

    if (canonicalTemplateSlug(templateSlug) === "heritage_luxury") {
      return (
        <PublicShell {...shellProps}>
          <JewelryThankYouPanel body={thankBody} helperText={kioskHelper} />
        </PublicShell>
      );
    }

    return (
      <PublicShell {...shellProps}>
        <StatePanel tone="success" title="Thank you" body={thankBody} helperText={kioskHelper} />
      </PublicShell>
    );
  }

  return (
    <FeedbackFlow
      branding={context.branding}
      channelCode={channelCode}
      key={formResetKey}
      locationName={context.location.name}
      onSubmitAnswers={async (submitAnswers: SubmitAnswer[]) => {
        try {
          const response = await submitPublicFeedback(channelCode, {
            locale: context.survey.default_locale,
            answers: submitAnswers,
            metadata: {
              source: "public-web",
              location_id: context.location.id,
            },
          });
          setThankYouText(response.thank_you_text);
          if (context.channel_type !== "kiosk" && !kioskUrlOverride) {
            try {
              sessionStorage.setItem(
                feedbackCompleteStorageKey(channelCode),
                JSON.stringify({ thank_you_text: response.thank_you_text }),
              );
            } catch {
              /* private / restricted storage */
            }
          }
          setViewState("submitted");
        } catch (error) {
          setSubmitError(error instanceof Error ? error.message : "Your response was not saved.");
          setViewState("error");
        }
      }}
      presentation={presentation}
      questions={context.questions}
      surveyDescription={context.survey.description}
      surveyTitle={context.survey.title}
      templateSlug={templateSlug}
      templateId={context.template?.id}
      theme={context.effective_theme ?? {}}
      organization={context.organization}
      disableStepBack={!isKioskLoop}
    />
  );
}

function PublicShell({
  children,
  templateSlug,
  largeTargets,
  theme,
  branding,
}: {
  children: ReactNode;
  templateSlug?: string;
  largeTargets?: boolean;
  theme?: Record<string, string>;
  branding?: { primary_color?: string | null; secondary_color?: string | null };
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const className = ["public-shell", largeTargets ? "public-shell--large-targets" : ""].filter(Boolean).join(" ");

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || (theme === undefined && branding === undefined)) {
      return;
    }
    applyTheme(theme ?? {}, el);
    applyBrandingCss(
      branding ?? { primary_color: null, secondary_color: null },
      el,
    );
    return () => {
      el.style.cssText = "";
    };
  }, [branding, theme]);

  return (
    <div
      ref={rootRef}
      className={className}
      {...(templateSlug ? { "data-template": canonicalTemplateSlug(templateSlug) } : {})}
    >
      {children}
    </div>
  );
}

function JewelryThankYouEmblem() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="40" cy="40" r="32" opacity="0.3" />
        <circle cx="40" cy="40" r="24" opacity="0.5" />
        <path
          d="M 40 22 Q 30 32 30 40 Q 30 48 40 56 Q 50 48 50 40 Q 50 32 40 22 Z"
          fill="currentColor"
          opacity="0.2"
        />
        <circle cx="40" cy="40" r="4" fill="currentColor" />
      </g>
    </svg>
  );
}

function JewelryThankYouPanel({ body, helperText }: { body: string; helperText?: string }) {
  return (
    <div className="jewelry-card-wrap">
      <div className="jewelry-card-page jewelry-card-page--thankyou">
        <div className="jewelry-thankyou">
          <div className="jewelry-thankyou-emblem">
            <JewelryThankYouEmblem />
          </div>
          <h1 className="jewelry-thankyou-title">Thank You</h1>
          <p className="jewelry-thankyou-message">{body}</p>
          {helperText ? <p className="jewelry-thankyou-helper">{helperText}</p> : null}
        </div>
      </div>
      <p className="public-powered jewelry-card-powered">Powered by goliSoda</p>
    </div>
  );
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
