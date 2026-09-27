import { errorLabels, type Locale } from "@shared/domain";

// Turns an API error into a message in the user's language.
export function describeApiError(error: { message: string }, locale: Locale) {
  return errorLabels[error.message]?.[locale] ?? error.message;
}
