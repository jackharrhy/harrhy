import { css, on, type Handle } from "remix/component";
import { Button } from "@harrhy/ui/native";

interface TweetSnapshot {
  url: string;
  author: { name: string; handle: string };
  text: string;
  publishedAt: string;
  capturedAt: string;
  provenance: string;
  media?: { src: string; alt: string }[];
}

const card = css({
  border: "1px solid var(--hui-border)",
  padding: "1.25rem",
  background: "var(--hui-surface)",
  color: "var(--hui-ink)",
  fontFamily: "var(--hui-font-ui)",
  "& p": { whiteSpace: "pre-wrap", marginBlock: "1rem" },
  "& figure": { margin: "1rem 0 0" },
  "& img": { width: "100%", height: "auto", display: "block" },
  "& figcaption": { fontSize: ".85rem", marginTop: ".5rem" },
  "& footer": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: ".5rem",
    marginTop: "1rem",
  },
});

/** Public curated data only: no remote embeds or API requests. */
export function Widget(handle: Handle<{ data: TweetSnapshot }>) {
  const data = handle.props.data;
  const canonical =
    /^https:\/\/x\.com\/([a-zA-Z0-9_]{1,15})\/status\/[0-9]{1,25}$/.exec(
      data?.url,
    );
  if (
    !canonical ||
    canonical[1] !== data.author.handle ||
    !data.author.name ||
    typeof data.text !== "string" ||
    data.text.length > 20000 ||
    !Number.isFinite(Date.parse(data.publishedAt)) ||
    !Number.isFinite(Date.parse(data.capturedAt))
  )
    throw new Error("Invalid public tweet snapshot");
  const photos = data.media ?? [];
  if (
    photos.length > 4 ||
    photos.some(
      (photo) =>
        !/^\/_atlas\/images\/[a-z][a-z0-9-]*\/[a-zA-Z0-9][a-zA-Z0-9/_.-]*\.(?:png|jpg|jpeg|webp|gif)$/.test(
          photo.src,
        ) ||
        photo.src.includes("..") ||
        !photo.alt,
    )
  )
    throw new Error("Expected local curated tweet images");
  let index = 0;
  return () => (
    <article aria-label={`Post by @${data.author.handle}`} mix={card}>
      <header>
        <strong>{data.author.name}</strong>{" "}
        <a href={`https://x.com/${data.author.handle}`}>
          @{data.author.handle}
        </a>
        <div>
          <time dateTime={data.publishedAt}>
            {new Date(data.publishedAt).toLocaleDateString("en", {
              year: "numeric",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
          </time>
        </div>
      </header>
      <p>{data.text}</p>
      {photos[index] && (
        <figure>
          <img
            src={photos[index].src}
            alt={photos[index].alt}
            decoding="async"
          />
          <figcaption aria-live="polite">
            Photo {index + 1} of {photos.length}: {photos[index].alt}
          </figcaption>
        </figure>
      )}
      <footer>
        {photos.length > 1 && (
          <>
            <Button
              variant="quiet"
              aria-label="Previous photo"
              disabled={index === 0}
              mix={on("click", () => {
                index--;
                handle.update();
              })}
            >
              Previous photo
            </Button>
            <Button
              variant="quiet"
              aria-label="Next photo"
              disabled={index === photos.length - 1}
              mix={on("click", () => {
                index++;
                handle.update();
              })}
            >
              Next photo
            </Button>
          </>
        )}
        <a href={data.url}>Original post on X</a>
      </footer>
      <details>
        <summary>Snapshot provenance</summary>
        <p>{data.provenance}</p>
        <small>
          Captured <time dateTime={data.capturedAt}>{data.capturedAt}</time>.
          This is a curated snapshot, not a live X embed. No live counts or
          account actions.
        </small>
      </details>
    </article>
  );
}
