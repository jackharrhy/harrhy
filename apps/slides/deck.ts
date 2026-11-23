export const kinds = [
  "text",
  "poster",
  "stretch",
  "image",
  "video",
  "windows",
] as const;
export type Kind = (typeof kinds)[number];
export interface Slide {
  id: string;
  kind: Kind;
  title: string;
  body: string;
  media?: string;
  x: number;
  y: number;
  width: number;
}
export const actions: Partial<Record<Kind, string>> = {
  poster: "type-title",
  stretch: "stretch-poster",
  windows: "swap-windows",
  video: "play-video",
};
export const freshSlide = (id: string, kind: Kind, title: string): Slide => ({
  id,
  kind,
  title,
  body: "",
  x: 6,
  y: 20,
  width: 88,
});
// Only used for an empty deck. Subsequent starts use SQLite.
export const seed = [
  freshSlide("cover", "poster", "example presentation"),
  {
    ...freshSlide("text", "text", "the sample deck"),
    body: "Sign in to edit the private draft.",
  },
  freshSlide("image", "image", "screenshot placeholder"),
  freshSlide("video", "video", "example recording"),
];
export interface DraftView {
  slides: Slide[];
  revision: number;
  publishedRevision: number;
  dirty: boolean;
}
export interface Position {
  scope: string;
  cursor: number;
  position: number;
  slideId: string;
  alternate: boolean;
  revision: number;
}
