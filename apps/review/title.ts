export const maxTitleLength = 120;
export const untitledReview = "Untitled review";
export const titleError = `Enter a single-line review title of 1–${maxTitleLength} characters.`;

// oxlint-disable-next-line no-control-regex -- Titles must not contain control characters or line separators.
const titleControl = /[\x00-\x1f\x7f\u2028\u2029]/;

export function titleFromSubject(subject: string) {
  const cleaned = subject.replace(new RegExp(titleControl.source, "g"), " ").trim();
  return normalizeTitle(cleaned.slice(0, maxTitleLength).toWellFormed()) ?? untitledReview;
}

export function normalizeTitle(value: unknown) {
  if (typeof value !== "string") return null;
  const title = value.trim();
  return title && title.length <= maxTitleLength && !titleControl.test(title) ? title : null;
}
