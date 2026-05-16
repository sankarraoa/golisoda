import type { SurveyPresentationInput } from "./surveyPresentation";

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

export type MeResponse = {
  user_id: string;
  email: string;
  tenant_id: string | null;
  role_codes: string[];
  permission_codes: string[];
  location_ids: string[];
  token_version: number;
};

export type AuditLogEntry = {
  id: string;
  occurred_at: string;
  actor_type: string;
  actor_id: string;
  tenant_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  outcome: string;
  request_id: string | null;
  metadata: Record<string, unknown>;
};


export type Tenant = {
  id: string;
  name: string;
  slug: string;
  default_locale: string;
  status: "active" | "suspended" | "offboarded";
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_state: string | null;
  address_postal_code: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantBranding = {
  id: string;
  tenant_id: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  thank_you_text: string;
  created_at: string;
  updated_at: string;
};

export type Location = {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  city: string | null;
  region: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Survey = {
  id: string;
  tenant_id: string;
  created_by_user_id: string | null;
  title: string;
  slug: string;
  description: string | null;
  default_locale: string;
  status: "draft" | "published" | "archived";
  created_at: string;
  updated_at: string;
};

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

export type QuestionOption = {
  id: string;
  value: string;
  label: string;
  sort_order: number;
};

export type SurveyQuestion = {
  id: string;
  tenant_id: string;
  survey_id: string;
  question_key: string;
  question_type: QuestionType;
  prompt: string;
  help_text: string | null;
  is_required: boolean;
  is_pii: boolean;
  sort_order: number;
  branching_metadata: Record<string, unknown>;
  options: QuestionOption[];
  created_at: string;
  updated_at: string;
};

export type SurveyDetail = Survey & {
  questions: SurveyQuestion[];
};

export type SurveyTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  deployment_notes: string | null;
  presentation: SurveyPresentationInput;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SurveyVersion = {
  id: string;
  tenant_id: string;
  survey_id: string;
  version_number: number;
  status: "published" | "archived";
  schema_snapshot: {
    survey?: {
      title?: string;
      slug?: string;
    };
  };
  published_at: string;
  published_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Channel = {
  id: string;
  tenant_id: string;
  location_id: string;
  survey_version_id: string;
  survey_template_id: string;
  name: string;
  channel_code: string;
  channel_type: "qr" | "kiosk";
  status: "active" | "disabled";
  qr_url: string | null;
  created_at: string;
  updated_at: string;
};

export type RoleBinding = {
  id: string;
  role_code: string;
  scope: "global" | "tenant" | "location";
  tenant_id: string | null;
  location_id: string | null;
};

export type TenantUser = {
  id: string;
  tenant_id: string | null;
  email: string;
  display_name: string;
  status: "active" | "disabled" | "invited";
  token_version: number;
  role_bindings: RoleBinding[];
  created_at: string;
  updated_at: string;
};

export type Permission = {
  id: string;
  code: string;
  description: string | null;
};

export type Role = {
  id: string;
  tenant_id: string | null;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permission_codes: string[];
  created_at: string;
  updated_at: string;
};

export type FeedbackAnswer = {
  question_key: string;
  question_type: string;
  value: unknown;
  is_pii: boolean;
};

export type ResponseQuestionDefinition = {
  question_key: string;
  question_type: string;
  prompt: string;
  sort_order: number;
  options: Array<{ value: string; label: string; sort_order?: number; id?: string }>;
};

export type FeedbackResponse = {
  id: string;
  tenant_id: string;
  channel_id: string;
  channel_name: string;
  location_id: string;
  location_name: string;
  survey_id: string;
  survey_title: string;
  survey_version_id: string;
  survey_version_number: number;
  locale: string;
  submitted_at: string;
  answers: FeedbackAnswer[];
  question_definitions: ResponseQuestionDefinition[];
};

export type FeedbackResponseListPage = {
  total: number;
  limit: number;
  offset: number;
  items: FeedbackResponse[];
};

export type DistributionBucket = {
  value: number;
  count: number;
};

export type AggregateChoiceRow = {
  value: string;
  label: string | null;
  count: number;
};

export type QuestionAggregate = {
  question_key: string;
  question_type: string;
  prompt: string;
  sort_order: number;
  answered_count: number;
  cohort_response_count: number;
  average: number | null;
  min_value: number | null;
  max_value: number | null;
  distribution: DistributionBucket[];
  choice_counts: AggregateChoiceRow[];
  text_sample_count: number;
  text_samples: string[];
};

export type VersionCohortAggregate = {
  survey_version_id: string;
  survey_id: string;
  survey_title: string;
  version_number: number;
  response_count: number;
  questions: QuestionAggregate[];
};

export type ResponseAggregateReport = {
  channel_id: string | null;
  channel_name: string;
  submitted_after: string | null;
  submitted_before: string | null;
  cohorts: VersionCohortAggregate[];
};

export type NpsSnapshotBlock = {
  response_count: number;
  promoters_pct: number;
  passives_pct: number;
  detractors_pct: number;
  nps: number | null;
};

export type NpsTrendMonth = {
  year: number;
  month: number;
  label: string;
  response_count: number;
  promoters_pct: number;
  passives_pct: number;
  detractors_pct: number;
  nps: number | null;
};

export type NpsDashboardPayload = {
  question_key: string;
  prompt: string;
  reporting_period_label: string;
  snapshot: NpsSnapshotBlock;
  nps_delta_vs_period_start: number | null;
  months: NpsTrendMonth[];
};

export type Csat2SnapshotBlock = {
  yes_count: number;
  no_count: number;
  answered_count: number;
  cohort_response_count: number;
  csat_pct: number | null;
  response_rate_pct: number;
};

export type Csat2TrendMonth = {
  year: number;
  month: number;
  label: string;
  response_count: number;
  yes_count: number;
  csat_pct: number | null;
};

export type Csat2DashboardPayload = {
  question_key: string;
  prompt: string;
  reporting_period_label: string;
  snapshot: Csat2SnapshotBlock;
  months: Csat2TrendMonth[];
};

export type AnalyticsSummary = {
  total_responses: number;
  nps_average: number | null;
  csat_average: number | null;
  active_channels: number;
};

export type DashboardData = {
  tenant: Tenant;
  branding: TenantBranding;
  locations: Location[];
  surveys: Survey[];
  surveyVersions: SurveyVersion[];
  surveyTemplates: SurveyTemplate[];
  channels: Channel[];
  users: TenantUser[];
  roles: Role[];
  permissions: Permission[];
  responses: FeedbackResponse[];
  analytics: AnalyticsSummary;
};
