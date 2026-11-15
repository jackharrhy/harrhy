import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { context as createBuildContext } from "esbuild";
import { spacePath } from "./spaces.ts";

export interface Widget {
  readonly id: string;
  readonly page: string;
  readonly digest: string;
  readonly script: string;
}
const imports = new Set([
  "remix/component",
  "remix/component/jsx-runtime",
  "@harrhy/ui/native",
  "@harrhy/ui/interactive",
  "@harrhy/ui/theme",
  "@harrhy/ui/recipes",
]);
const project = path.resolve(import.meta.dirname, "../../..");

async function readFile(filename: string, max: number) {
  if (!path.isAbsolute(filename))
    throw new Error("Expected absolute widget path");
  let current = path.parse(filename).root;
  for (const part of filename
    .slice(current.length)
    .split(path.sep)
    .slice(0, -1)) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Widget symlink forbidden");
  }
  const file = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > max)
      throw new Error("Widget source exceeds limit");
    const buffer = Buffer.alloc(max + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > max) throw new Error("Widget source exceeds limit");
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await file.close();
  }
}
function hash(source: string) {
  return createHash("sha256").update(source).digest("hex");
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Compiles browser code only. Authored modules are never imported by Node. */
export function createWidgetLoader(manifest: string) {
  let cache = new Map<string, Widget>();
  return async (): Promise<readonly Widget[]> => {
    try {
      const config: unknown = JSON.parse(await readFile(manifest, 131072));
      if (
        !object(config) ||
        Object.keys(config).some(
          (key) => !["trust", "root", "widgets"].includes(key),
        ) ||
        config.trust !== "tailnet-owner-temporary" ||
        typeof config.root !== "string" ||
        !path.isAbsolute(config.root) ||
        !Array.isArray(config.widgets) ||
        config.widgets.length > 16
      )
        throw new Error("Invalid widget configuration");
      const nextCache = new Map<string, Widget>();
      const widgets: Widget[] = [];
      const ids = new Set<string>();
      let total = 0;
      for (const entry of config.widgets) {
        if (
          !object(entry) ||
          Object.keys(entry).some(
            (key) => !["id", "space", "page", "module"].includes(key),
          ) ||
          typeof entry.id !== "string" ||
          !/^[a-z][a-z0-9-]{0,63}$/.test(entry.id) ||
          ids.has(entry.id) ||
          typeof entry.space !== "string" ||
          !/^[a-z][a-z0-9-]{0,63}$/.test(entry.space) ||
          typeof entry.page !== "string" ||
          !/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(entry.page) ||
          typeof entry.module !== "string" ||
          !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.tsx$/.test(entry.module)
        )
          throw new Error("Invalid widget registration");
        ids.add(entry.id);
        const source = await readFile(
          path.join(config.root, entry.module),
          131072,
        );
        const page =
          spacePath(entry.space) + (entry.page === "/" ? "/" : entry.page);
        const fingerprint = hash(JSON.stringify([entry, source]));
        let widget = cache.get(fingerprint);
        if (!widget) {
          const id = entry.id;
          const compiler = await createBuildContext({
            stdin: {
              contents: `import {createRoot, createElement} from 'remix/component';
const host=document.getElementById('atlas-widget-${id}');
const notice=document.getElementById('atlas-widget-notice-${id}');
let errored=false;
function failed(){errored=true;if(notice){notice.hidden=false;notice.textContent='Interactive content failed. The article remains readable.';}}
try {const module=await import('atlas:source'); if(typeof module.Widget!=='function')throw new Error('Missing Widget export');
const root=createRoot(host);root.addEventListener('error',failed);root.render(createElement(module.Widget,{}));root.flush();if(!errored)notice.hidden=true;window.addEventListener('pagehide',()=>root.dispose(),{once:true});
} catch {failed();}`,
              loader: "ts",
              resolveDir: project,
              sourcefile: "atlas-widget-entry.ts",
            },
            bundle: true,
            write: false,
            platform: "browser",
            format: "esm",
            target: "es2022",
            jsx: "automatic",
            jsxImportSource: "remix/component",
            tsconfigRaw: {
              compilerOptions: {
                jsx: "react-jsx",
                jsxImportSource: "remix/component",
                verbatimModuleSyntax: true,
              },
            },
            define: { "process.env.NODE_ENV": '"production"' },
            sourcemap: false,
            minify: true,
            logLevel: "silent",
            plugins: [
              {
                name: "atlas-trusted-widget",
                setup(plugin) {
                  plugin.onResolve(
                    { filter: /^atlas:source$/, namespace: "file" },
                    () => ({
                      path: "source.tsx",
                      namespace: "atlas-author",
                    }),
                  );
                  plugin.onLoad(
                    { filter: /.*/, namespace: "atlas-author" },
                    () => ({
                      contents: source,
                      loader: "tsx",
                      resolveDir: project,
                    }),
                  );
                  plugin.onResolve(
                    { filter: /.*/, namespace: "atlas-author" },
                    (args) => {
                      if (!imports.has(args.path))
                        return {
                          errors: [
                            {
                              text: "Widget imports must use approved browser UI entry points",
                            },
                          ],
                        };
                      return undefined;
                    },
                  );
                },
              },
            ],
          });
          const timer = setTimeout(() => {
            void compiler.cancel();
          }, 5000);
          let script: string | undefined;
          try {
            const result = await compiler.rebuild();
            if (result.warnings.length)
              throw new Error("Widget compilation warning");
            script = result.outputFiles?.[0]?.text;
          } finally {
            clearTimeout(timer);
            await compiler.dispose();
          }
          if (!script) throw new Error("Widget compilation returned no script");
          if (Buffer.byteLength(script) > 1048576)
            throw new Error("Widget bundle exceeds limit");
          widget = Object.freeze({ id, page, script, digest: hash(script) });
        }
        total += Buffer.byteLength(widget.script);
        if (total > 8388608) throw new Error("Widget generation exceeds limit");
        nextCache.set(fingerprint, widget);
        widgets.push(widget);
      }
      cache = nextCache;
      return Object.freeze(widgets);
    } catch {
      throw new Error(
        "Invalid trusted widgets: check configuration, TSX syntax and approved imports",
      );
    }
  };
}
