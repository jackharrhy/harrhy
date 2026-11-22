// Test component fixtures compile as browser scripts (`buildBrowserScript`); the web is Chord's web surface
// (server.ts).
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type BuildOptions, build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));

/** Options of browser code compiled here (test component fixtures): the app's tsconfig, minified, nothing on disk. */
const browser = {
	bundle: true,
	write: false,
	format: "esm",
	minify: true,
	legalComments: "none",
	absWorkingDir: root,
	tsconfig: join(root, "tsconfig.json"),
	// Plugins of the user root (in the data directory) find the app's packages (react) as the built-ins do.
	nodePaths: [join(root, "node_modules"), join(root, "../../node_modules")],
	logLevel: "silent",
	platform: "browser",
	target: "es2022",
	// Fonts (Elanor's, from its packages' CSS) are files of the bundle, named by their content.
	loader: { ".woff2": "file" },
	define: { "process.env.NODE_ENV": '"production"' },
} as const satisfies BuildOptions;

/** One browser script (an IIFE) from `entry`. Tests use it to run component fixtures (`test/fixtures/`) in an open page. */
export async function buildBrowserScript(entry: string): Promise<string> {
	const result = await build({
		...browser,
		entryPoints: [entry],
		outdir: join(root, ".p2-script"),
		format: "iife",
	});
	const script = result.outputFiles.find((file) => file.path.endsWith(".js"));
	if (!script) throw new Error(`${entry} compiled to no script`);
	return script.text;
}
