import { expandedStories } from "./expanded-stories.tsx";

export const stories = [
  ...expandedStories,
  {
    id: "button",
    name: "Button",
    group: "Actions",
    summary: "An action, with a clear priority.",
  },
  {
    id: "field",
    name: "Field",
    group: "Forms",
    summary: "One control, its label, help and validation.",
  },
  {
    id: "select",
    name: "Select",
    group: "Forms",
    summary: "Choose one value from a short list.",
  },
  {
    id: "range",
    name: "Range",
    group: "Forms",
    summary: "A native slider with themed focus and a usable hit area.",
  },
  {
    id: "checkbox",
    name: "Checkbox",
    group: "Forms",
    summary: "An independent, labelled choice.",
  },
  {
    id: "textarea",
    name: "Textarea",
    group: "Forms",
    summary: "Room for a longer answer.",
  },
  {
    id: "notice",
    name: "Notice",
    group: "Feedback",
    summary: "Feedback that belongs beside the task.",
  },
  {
    id: "badge",
    name: "Badge",
    group: "Feedback",
    summary: "A short, non-interactive label.",
  },
  {
    id: "dialog",
    name: "Dialog",
    group: "Overlays",
    summary: "A focused task with native focus containment.",
  },
  {
    id: "tabs",
    name: "Navigation",
    group: "Navigation",
    summary: "Route links and in-page tabs share presentation, not behavior.",
  },
  {
    id: "panel",
    name: "Panel",
    group: "Layout",
    summary: "A named surface for related content.",
  },
  {
    id: "code",
    name: "CodeBlock",
    group: "Code",
    summary: "Selectable source with Pierre Highlights syntax highlighting.",
  },
  {
    id: "diff",
    name: "CodeDiff",
    group: "Code",
    summary: "Prepared changes, readable without color.",
  },
] as const;
export type StoryId = (typeof stories)[number]["id"];
