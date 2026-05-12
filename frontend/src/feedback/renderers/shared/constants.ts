export const SHORT_TEXT_MAX = 2048;
export const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const DEFAULT_EMOJI_5_LABELS = ["Very Poor", "Poor", "Fair", "Good", "Excellent"] as const;
export const DEFAULT_EMOJI_4_LABELS = ["Poor", "Fair", "Good", "Excellent"] as const;

export const EMOJI_FACE_5 = ["😡", "😞", "😐", "😊", "😍"] as const;
export const EMOJI_FACE_4 = ["😞", "😕", "🙂", "😄"] as const;

export const NPS_SEGMENTS: Array<{ label: string; scores: readonly number[] }> = [
  { label: "Not likely", scores: [0, 1, 2, 3, 4, 5, 6] },
  { label: "Neutral", scores: [7, 8] },
  { label: "Very likely", scores: [9, 10] },
];

