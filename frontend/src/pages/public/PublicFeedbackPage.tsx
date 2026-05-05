import { useEffect, useMemo, useState, type ReactNode } from "react";

import { FeedbackFlow } from "../../components/feedback/FeedbackFlow";
import { fetchPublicFeedbackContext, submitPublicFeedback } from "../../lib/publicFeedbackApi";
import type { PublicFeedbackContext, SubmitAnswer } from "../../types/publicFeedback";
import { resolveSurveyPresentation } from "../../types/publicFeedback";

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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [thankYouText, setThankYouText] = useState<string | null>(null);
  const [resetSeconds, setResetSeconds] = useState(5);
  const [formResetKey, setFormResetKey] = useState(0);

  const channelCode = useMemo(getChannelCodeFromPath, []);
  const isKioskMode = useMemo(
    () => new URLSearchParams(window.location.search).get("kiosk") === "1",
    [],
  );

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
      document.documentElement.style.setProperty("--color-tenant-primary", context.branding.primary_color);
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

  const presentation = resolveSurveyPresentation(context);
  const templateSlug = context.template?.slug ?? "default_stepper";

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
          setViewState("submitted");
        } catch (error) {
          setSubmitError(error instanceof Error ? error.message : "Your response was not saved.");
          setViewState("error");
        }
      }}
      presentation={presentation}
      questions={context.questions}
      surveyTitle={context.survey.title}
      templateSlug={templateSlug}
    />
  );
}

function PublicShell({ children }: { children: ReactNode }) {
  return <div className="public-shell">{children}</div>;
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
