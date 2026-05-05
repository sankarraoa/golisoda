import type { PublicFeedbackContext, SubmitAnswer, SubmitResponse } from "../types/publicFeedback";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function fetchPublicFeedbackContext(
  channelCode: string,
): Promise<PublicFeedbackContext> {
  if (!channelCode) {
    throw new Error("This feedback link is missing its channel code.");
  }

  const response = await fetch(`${API_BASE_URL}/f/${encodeURIComponent(channelCode)}`);
  if (!response.ok) {
    throw new Error("We could not load this feedback form.");
  }
  return response.json();
}

export async function submitPublicFeedback(
  channelCode: string,
  payload: { locale: string; answers: SubmitAnswer[]; metadata: Record<string, string> },
): Promise<SubmitResponse> {
  const response = await fetch(`${API_BASE_URL}/f/${encodeURIComponent(channelCode)}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Your response was not saved. Please try again.");
  }

  return response.json();
}
