import { css } from "remix/component";
import { renderToString } from "remix/component/server";
import {
  Button,
  ButtonLink,
  Field,
  Input,
  Textarea,
  Panel,
  Stack,
} from "@harrhy/ui/native";
import { jelloTheme, themeRoot, themeStyles } from "@harrhy/ui/theme";
import { kinds, type DraftView } from "./deck.ts";

const surface = css({
  maxWidth: "56rem",
  margin: "0 auto",
  padding: "1.5rem",
  fontFamily: "var(--hui-font-ui)",
  "& form": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "end",
    gap: ".75rem",
    marginBlock: "1rem",
  },
  "& select": { padding: ".45rem", font: "inherit", maxWidth: "100%" },
  "& [data-part=field]": { minWidth: 0, maxWidth: "100%" },
  "& textarea": { minHeight: "5rem" },
  "& img, & video": { maxWidth: "100%", maxHeight: "12rem" },
  "& form[enctype]": { display: "grid", alignItems: "start" },
});

const button = (value: string, label: string, disabled = false) => (
  <Button type="submit" name="intent" value={value} disabled={disabled}>
    {label}
  </Button>
);

export async function editorPage(view: DraftView, requested: string | null) {
  const slide = view.slides.find((s) => s.id === requested) ?? view.slides[0];
  const position = view.slides.indexOf(slide);
  const fields = [
    <input type="hidden" name="revision" value={view.revision} />,
    <input type="hidden" name="id" value={slide.id} />,
  ];
  return (
    "<!doctype html>" +
    (await renderToString(
      <html lang="en" mix={[themeStyles(jelloTheme), themeRoot]}>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>Edit deck · Slides</title>
        </head>
        <body>
          <main mix={surface}>
            <ButtonLink href="/">Return to presentation</ButtonLink>
            <h1>Edit deck</h1>
            <p>
              Draft {view.revision} · Published {view.publishedRevision}. Save
              slide edits before publishing the deck.
            </p>
            <form method="get" action="/edit">
              <Field label="Slide" id="slide-choice">
                <select name="slide" id="slide-choice">
                  {view.slides.map((s, i) => (
                    <option value={s.id} selected={s.id === slide.id}>
                      {i + 1}. {s.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="submit">Open slide</Button>
            </form>
            <Panel>
              <Stack>
                <h2>
                  {position + 1}. {slide.title}
                </h2>
                <form
                  method="post"
                  action="/edit"
                  encType="multipart/form-data"
                >
                  {fields}
                  <Field id="slide-title" label="Title">
                    <Input
                      name="title"
                      value={slide.title}
                      required
                      maxLength={240}
                    />
                  </Field>
                  <Field id="slide-body" label="Body">
                    <Textarea
                      name="body"
                      maxLength={8000}
                      defaultValue={slide.body}
                    />
                  </Field>
                  {slide.kind === "image" &&
                    (["x", "y", "width"] as const).map((k) => (
                      <Field id={"placement-" + k} label={k + " (%)"}>
                        <Input
                          name={k}
                          type="number"
                          step="0.1"
                          min={k === "width" ? 1 : 0}
                          max={100}
                          required
                          value={slide[k]}
                        />
                      </Field>
                    ))}
                  {["windows", "image", "video"].includes(slide.kind) && (
                    <Field
                      id="attachment"
                      label={
                        slide.kind === "video" ? "Replace MP4" : "Replace image"
                      }
                      description="8 MiB maximum"
                    >
                      <Input
                        name="media"
                        type="file"
                        accept={
                          slide.kind === "video"
                            ? "video/mp4"
                            : "image/png,image/jpeg,image/webp"
                        }
                      />
                    </Field>
                  )}
                  {button("save", "Save slide to draft")}
                </form>
                {slide.media &&
                  (slide.kind === "video" ? (
                    <video controls src={"/edit/media/" + slide.media} />
                  ) : (
                    <img src={"/edit/media/" + slide.media} alt={slide.title} />
                  ))}
                <form action="/edit" method="post">
                  {fields}
                  {button("up", "Move earlier", position === 0)}
                  {button(
                    "down",
                    "Move later",
                    position === view.slides.length - 1,
                  )}
                  {slide.media && button("clear-media", "Remove attachment")}
                  {button("remove", "Remove slide", view.slides.length === 1)}
                </form>
                <form action="/edit" method="post">
                  {fields}
                  <Field label="New slide type" id="kind-choice">
                    <select name="kind" id="kind-choice">
                      {kinds.map((k) => (
                        <option value={k}>{k}</option>
                      ))}
                    </select>
                  </Field>
                  {button("add", "Insert after this slide")}
                </form>
              </Stack>
            </Panel>
            <form action="/edit" method="post">
              {fields}
              {button("publish", "Publish saved draft", !view.dirty)}
              {button("discard", "Discard draft edits", !view.dirty)}
            </form>
          </main>
        </body>
      </html>,
    ))
  );
}
