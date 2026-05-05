export type QuestionType =
  | "nps"
  | "csat"
  | "single_selection"
  | "multi_selection"
  | "plain_text"
  | "dropdown";

export type PublicBranding = {
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  thank_you_text: string;
};

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

export type PublicFeedbackContext = {
  channel_code: string;
  tenant_id: string;
  location: {
    id: string;
    name: string;
    city: string | null;
    region: string | null;
  };
  branding: PublicBranding;
  survey_version_id: string;
  survey: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    default_locale: string;
  };
  questions: PublicQuestion[];
};

export type AnswerValue = string | number | string[];

export type SubmitAnswer = {
  question_key: string;
  value: AnswerValue;
};

export type SubmitResponse = {
  submitted: boolean;
  thank_you_text: string;
};
