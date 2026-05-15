import type { SurveyTemplate } from "../types/admin";
import { canonicalTemplateSlug } from "./templateSlug";
import { normalizeSurveyPresentation, type SurveyPresentationInput } from "../types/surveyPresentation";

/** Fixed catalog copy so list rows stay short even when DB descriptions are long. */
const SUMMARY_BY_SLUG: Record<string, readonly [string, string]> = {
  default_stepper: [
    "One question per screen with a progress bar.",
    "Best on phones; ideal for QR links and SMS.",
  ],
  single_page: [
    "All questions on one scrollable page.",
    "Best on phone or desktop for shorter surveys.",
  ],
  kiosk_touch: [
    "Large tap targets, dotted progress, step-by-step flow.",
    "Optimized for shared tablets and wall kiosks.",
  ],
  heritage_immersive: [
    "Single-page layout with immersive brand framing.",
    "Best on tablet or phone (portrait); large touch targets.",
  ],
  heritage_luxury: [
    "Premium split layout with hero imagery and refined type.",
    "Best on tablet or desktop; large phones in landscape.",
  ],
  phone_portrait: [
    "Step-by-step flow with dot progress and roomy tap targets.",
    "Built for QR and links opened on a phone held upright.",
  ],
};

function fallbackSummary(presentation: SurveyPresentationInput): readonly [string, string] {
  const pres = normalizeSurveyPresentation(presentation);
  const large = pres.touch.large_targets;
  const layoutPhrase =
    pres.layout === "single_page"
      ? "Single-page layout: all questions on one scrollable screen."
      : "Stepper layout: one question per screen.";
  const line2 = large
    ? "Optimized for tablet or kiosk (large touch targets)."
    : "Works on phones, tablets, and desktop browsers.";
  return [layoutPhrase, line2];
}

/** Two short lines: what the template is, then primary device context (for dense catalog lists). */
export function getTemplateCatalogSummaryLines(template: SurveyTemplate): readonly [string, string] {
  const fromSlug = SUMMARY_BY_SLUG[canonicalTemplateSlug(template.slug)];
  if (fromSlug) {
    return fromSlug;
  }
  return fallbackSummary(template.presentation ?? {});
}
