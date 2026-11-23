const previewStyles = `
#clicker .clicker-preview {
  margin: .75rem 0 0;
  font: 600 .8rem/1.3 var(--hui-font-ui);
}
#clicker .clicker-preview figcaption { margin-block-end: .3rem; }
#clicker .clicker-preview-stage {
  container-type: size;
  inline-size: 100%;
  aspect-ratio: 16 / 9;
  overflow: clip;
  position: relative;
  background: var(--hui-surface);
  border: 1px solid var(--hui-border);
  border-radius: .35rem;
}
#clicker .clicker-preview-stage .slide { text-align: start; }
#clicker.clicker-with-previews .clicker-arrows { margin-block: .75rem; }
#clicker.clicker-with-previews .clicker-arrows button { min-height: 3.5rem; }
@media (max-width: 48rem), (pointer: coarse) {
  #clicker.clicker-with-previews {
    inset: 0;
    inline-size: 100%;
    block-size: 100dvh;
    max-inline-size: none;
    max-block-size: none;
    margin: 0;
    border: 0;
    border-radius: 0;
    padding: max(.75rem, env(safe-area-inset-top)) max(.75rem, env(safe-area-inset-right))
      max(.75rem, env(safe-area-inset-bottom)) max(.75rem, env(safe-area-inset-left));
    overflow: auto;
    overscroll-behavior: contain;
  }
  #clicker.clicker-with-previews .clicker-preview-stage {
    inline-size: min(100%, calc(25dvh * 16 / 9));
    margin-inline: auto;
  }
}
`;

const preview = () => {
  const figure = document.createElement("figure");
  figure.className = "clicker-preview";
  const caption = document.createElement("figcaption");
  const stage = document.createElement("div");
  stage.className = "clicker-preview-stage";
  stage.setAttribute("inert", "");
  stage.setAttribute("aria-hidden", "true");
  figure.appendChild(caption);
  figure.appendChild(stage);
  return { figure, caption, stage };
};

export function clickerPreview(
  dialog: HTMLDialogElement,
  slides: readonly HTMLElement[],
) {
  const controls = dialog.querySelector(".clicker-arrows");
  if (!controls) return;
  const styles = document.createElement("style");
  styles.textContent = previewStyles;
  document.head.appendChild(styles);
  dialog.classList.add("clicker-with-previews");

  const current = preview();
  const next = preview();
  dialog.insertBefore(current.figure, controls);
  dialog.appendChild(next.figure);

  const paint = (
    { caption, stage }: ReturnType<typeof preview>,
    index: number,
    label: string,
  ) => {
    const slide = slides[index];
    if (!slide) {
      caption.textContent = "End of deck";
      stage.hidden = true;
      stage.replaceChildren();
      return;
    }
    const title = slide.querySelector("h1, h2");
    const name =
      title?.getAttribute("aria-label") || title?.textContent?.trim();
    caption.textContent = `${label} · ${index + 1}/${slides.length}${name ? ` · ${name}` : ""}`;
    const thumbnail = slide.cloneNode(true) as HTMLElement;
    thumbnail.hidden = false;
    thumbnail.removeAttribute("aria-labelledby");
    for (const element of thumbnail.querySelectorAll("[id]"))
      element.removeAttribute("id");
    for (const video of thumbnail.querySelectorAll("video")) {
      video.removeAttribute("autoplay");
      video.preload = "metadata";
      video.muted = true;
    }
    stage.hidden = false;
    stage.replaceChildren(thumbnail);
  };

  let index = -1;
  const draw = () => {
    if (!dialog.open) return;
    paint(current, index, "Current");
    paint(next, index + 1, "Next");
  };
  // Refresh after asynchronous screenshot loading and poster fitting on the live stage.
  const observer = new MutationObserver(draw);
  const options: MutationObserverInit = {
    subtree: true,
    attributes: true,
    childList: true,
    characterData: true,
  };
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    observer.disconnect();
    current.stage.replaceChildren();
    next.stage.replaceChildren();
  });
  return (position: number) => {
    index = position;
    if (!dialog.open) return;
    observer.disconnect();
    for (const slide of slides.slice(index, index + 2))
      observer.observe(slide, options);
    draw();
  };
}
