import type { CSSProperties, FormEvent, ReactNode } from "react";

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
}: {
  templateSlug: string;
  presentation: SurveyPresentation;
  progress: ReactNode;
  header: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const shellClass = [
    "public-shell",
    presentation.touch.large_targets ? "public-shell--large-targets" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass} data-template={templateSlug}>
      <form className="public-card" onSubmit={onSubmit}>
        {progress}
        {header}
        {children}
        {footer}
      </form>
      <p className="public-powered">Powered by goliSoda</p>
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
  subtitle: string;
}) {
  return (
    <header className="public-header">
      {logo}
      <h1 className="public-title">{title}</h1>
      <p className="public-subtitle">{subtitle}</p>
    </header>
  );
}
