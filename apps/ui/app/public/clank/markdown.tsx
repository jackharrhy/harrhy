import { ref, type Handle } from "remix/component";
import { createDomRenderer } from "@pierre/words/html";

export function Words(handle: Handle<{ source: string; active: boolean }>) {
  let renderer: ReturnType<typeof createDomRenderer> | undefined;
  const update = () =>
    renderer?.update(
      handle.props.source,
      handle.props.active,
      handle.props.active,
    );
  const host = ref((node: HTMLDivElement, signal) => {
    renderer = createDomRenderer(node, {
      allowedElements: [
        "p",
        "strong",
        "em",
        "pre",
        "code",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
      ],
      allowedHtml: {},
      urlTransform: () => null,
      controls: false,
      lineNumbers: false,
    });
    renderer.connect();
    update();
    signal.addEventListener(
      "abort",
      () => {
        renderer?.disconnect();
        renderer = undefined;
      },
      { once: true },
    );
  });
  return () => {
    handle.queueTask(update);
    return <div data-engine="words" mix={host} />;
  };
}
// Only the fixture dialect: paragraphs, triple-backtick fences and pipe tables.
// Unknown syntax is inert text. A blank line inside a fence is not a boundary.
function settledBlock(raw: string, key: number) {
  const fenced = /^```\w*\n([\s\S]*?)\n```$/.exec(raw);
  if (fenced)
    return (
      <pre key={key}>
        <code>{fenced[1]}</code>
      </pre>
    );
  const lines = raw.split("\n");
  if (
    lines.length >= 2 &&
    lines.every((line) => line.startsWith("|") && line.endsWith("|"))
  ) {
    const rows = lines.map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
    if (
      rows[1].every((cell) => /^:?-{3,}:?$/.test(cell)) &&
      rows.every((row) => row.length === rows[0].length)
    )
      return (
        <table key={key}>
          <thead>
            <tr>
              {rows[0].map((cell) => (
                <th scope="col">{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(2).map((row) => (
              <tr>
                {row.map((cell) => (
                  <td>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
  return <p key={key}>{raw}</p>;
}
export function Settled(handle: Handle<{ source: string; active: boolean }>) {
  let previous = "",
    offset = 0,
    done: ReturnType<typeof settledBlock>[] = [];
  return () => {
    const { source, active } = handle.props;
    if (!source.startsWith(previous)) {
      done = [];
      offset = 0;
    }
    previous = source;
    let fenced = false;
    const start = offset;
    for (const match of source
      .slice(offset)
      .matchAll(/^\x60\x60\x60[^\n]*|\n\n/gm)) {
      if (match[0].startsWith("```")) fenced = !fenced;
      else if (!fenced) {
        const end = start + match.index;
        done.push(settledBlock(source.slice(offset, end), offset));
        offset = end + 2;
      }
    }
    const tail = source.slice(offset);
    return (
      <div data-engine="tail">
        {done}
        {tail &&
          (active ? (
            <div key={"tail" + offset} class="tail">
              {tail}
            </div>
          ) : (
            settledBlock(tail, offset)
          ))}
      </div>
    );
  };
}
