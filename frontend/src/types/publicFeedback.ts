import type { SurveyPresentation, SurveyPresentationInput } from "./surveyPresentation";
import { DEFAULT_SURVEY_PRESENTATION, normalizeSurveyPresentation } from "./surveyPresentation";

export type QuestionType =
  | "nps"
  | "csat_5"
  | "csat_4"
  | "csat_2"
  | "single_selection"
  | "multi_selection"
  | "plain_text"
  | "short_text"
  | "phone"
  | "email"
  | "dropdown";

export type PublicBranding = {
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  thank_you_text: string;
};

/** Tenant profile for optional header display (e.g. heritage_luxury). */
export type PublicOrganization = {
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
};

/** Map API / tenant profile fields to `PublicOrganization` (state → `region`). */
export function mapTenantProfileToPublicOrganization(tenant: {
  name: string;
  address_line1?: string | null;
  address_line2?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_postal_code?: string | null;
}): PublicOrganization {
  return {
    name: tenant.name,
    address_line1: tenant.address_line1 ?? null,
    address_line2: tenant.address_line2 ?? null,
    city: tenant.address_city ?? null,
    region: tenant.address_state ?? null,
    postal_code: tenant.address_postal_code ?? null,
  };
}

/** Non-empty address lines for display (street lines + city, state, postal). */
export function formatPublicOrganizationAddressLines(org: PublicOrganization): string[] {
  const lines: string[] = [];
  const l1 = org.address_line1?.trim();
  const l2 = org.address_line2?.trim();
  if (l1) {
    lines.push(l1);
  }
  if (l2) {
    lines.push(l2);
  }
  const city = org.city?.trim();
  const region = org.region?.trim();
  const postal = org.postal_code?.trim();
  const cityRegion = [city, region].filter(Boolean).join(", ");
  const last = [cityRegion, postal].filter(Boolean).join(cityRegion && postal ? " " : "");
  if (last) {
    lines.push(last);
  }
  return lines;
}

export type PublicQuestionOption = {
  id: string;
  value: string;
  label: string;
  sort_order: number;
};

export type PublicQuestion = {
  id: string;
  question_key: string;
  question_type: QuestionType;
  prompt: string;
  help_text: string | null;
  is_required: boolean;
  is_pii: boolean;
  sort_order: number;
  options: PublicQuestionOption[];
};

export type PublicSurveyTemplate = {
  id: string;
  slug: string;
  name: string;
  presentation: SurveyPresentationInput;
};

export type PublicFeedbackContext = {
  channel_code: string;
  channel_type: "qr" | "kiosk";
  tenant_id: string;
  location: {
    id: string;
    name: string;
    city: string | null;
    region: string | null;
  };
  organization: PublicOrganization;
  branding: PublicBranding;
  effective_theme: Record<string, string>;
  survey_version_id: string;
  survey: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    default_locale: string;
  };
  questions: PublicQuestion[];
  template?: PublicSurveyTemplate;
};

export function resolveSurveyPresentation(
  context: Pick<PublicFeedbackContext, "template">,
): SurveyPresentation {
  const raw = context.template?.presentation;
  if (!raw) {
    return DEFAULT_SURVEY_PRESENTATION;
  }
  return normalizeSurveyPresentation((raw ?? {}) as SurveyPresentationInput);
}

export type AnswerValue = string | number | string[];

export type SubmitAnswer = {
  question_key: string;
  value: AnswerValue;
};

export type SubmitResponse = {
  submitted: boolean;
  thank_you_text: string;
};
