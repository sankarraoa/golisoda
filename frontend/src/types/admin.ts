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

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  default_locale: string;
  status: "active" | "suspended" | "offboarded";
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
  | "csat"
  | "single_selection"
  | "multi_selection"
  | "plain_text"
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

export type FeedbackResponse = {
  id: string;
  tenant_id: string;
  channel_id: string;
  channel_name: string;
  location_id: string;
  location_name: string;
  survey_version_id: string;
  locale: string;
  submitted_at: string;
  answers: FeedbackAnswer[];
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
  channels: Channel[];
  users: TenantUser[];
  roles: Role[];
  permissions: Permission[];
  responses: FeedbackResponse[];
  analytics: AnalyticsSummary;
};
