import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";

import { applyBrandingCss, applyTheme } from "../../feedback/theme/applyTheme";
import type { PublicBranding } from "../../types/publicFeedback";
import { canonicalTemplateSlug, isHeritageImmersiveFamilySlug } from "../../lib/templateSlug";
import type { SurveyPresentation } from "../../types/surveyPresentation";

export function FeedbackProgress({
  presentation,
  questionIndex,
  totalQuestions,
}: {
  presentation: SurveyPresentation;
  questionIndex: number;
  totalQuestions: number;
}) {
  if (presentation.progress.style === "none" || totalQuestions < 1) {
    return null;
  }

  const progressWidth = `${((questionIndex + 1) / totalQuestions) * 100}%`;

  if (presentation.progress.style === "dots") {
    return (
      <div className="public-progress public-progress--dots" aria-hidden>
        {Array.from({ length: totalQuestions }, (_, index) => (
          <span
            className={`public-progress-dot ${index <= questionIndex ? "public-progress-dot--filled" : ""}`}
            key={index}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="public-progress">
      <div
        className="public-progress-value"
        style={{ "--progress-width": progressWidth } as CSSProperties}
      />
    </div>
  );
}

export function FeedbackShell({
  templateSlug,
  presentation,
  progress,
  header,
  children,
  footer,
  onSubmit,
  theme = {},
  branding,
}: {
  templateSlug: string;
  presentation: SurveyPresentation;
  progress: ReactNode;
  header: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  theme?: Record<string, string>;
  branding?: Pick<PublicBranding, "primary_color" | "secondary_color">;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const shellClass = [
    "public-shell",
    presentation.touch.large_targets ? "public-shell--large-targets" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) {
      return;
    }
    applyTheme(theme, el);
    applyBrandingCss(
      branding ?? { primary_color: null, secondary_color: null },
      el,
    );
    return () => {
      el.style.cssText = "";
    };
  }, [branding, theme]);

  const formBody = (
    <>
      {progress}
      {header}
      {children}
      {footer}
    </>
  );

  const slug = canonicalTemplateSlug(templateSlug);
  const isJewelryCardLayout = slug === "heritage_luxury";
  const isHeritageImmersive = isHeritageImmersiveFamilySlug(templateSlug);
  const cardClass = ["public-card", isJewelryCardLayout ? "jewelry-card-form" : "", isHeritageImmersive ? "heritage-immersive-card" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={rootRef} className={shellClass} data-template={slug}>
      {isJewelryCardLayout ? (
        <div className="jewelry-card-wrap">
          <div className="jewelry-card-page">
            <div className="jewelry-card-grid">
              <form className={cardClass} onSubmit={onSubmit}>
                {formBody}
              </form>
              <aside className="jewelry-card-hero" aria-hidden>
                <img alt="" decoding="async" src="/feedback-theme/jewelry-feedback-hero.png" />
              </aside>
            </div>
          </div>
          <p className="public-powered jewelry-card-powered">Powered by goliSoda</p>
        </div>
      ) : (
        <>
          <form className={isHeritageImmersive ? cardClass : "public-card"} onSubmit={onSubmit}>
            {formBody}
          </form>
          <p className={`public-powered${isHeritageImmersive ? " heritage-immersive-powered" : ""}`}>Powered by goliSoda</p>
        </>
      )}
    </div>
  );
}

export function FeedbackHeader({
  logo,
  title,
  subtitle,
}: {
  logo: ReactNode;
  title: string;
  subtitle: ReactNode;
}) {
  return (
    <header className="public-header">
      {logo}
      <h1 className="public-title">{title}</h1>
      <div className="public-subtitle">{subtitle}</div>
    </header>
  );
}
