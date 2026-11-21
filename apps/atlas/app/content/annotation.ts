export const ANNOTATION_PROJECTION_VERSION = 2;
export function annotationTitle(title: string): string {
  return title.replace(/\r\n?/g, "\n").replace(/\0/g, "\ufffd").toWellFormed();
}
export function articleAnnotationText(title: string, body: string): string {
  return annotationTitle(title) + "\n" + body;
}
export function annotationProjectionInput(text: string): string {
  return "atlas-annotation-v2\0" + text;
}
