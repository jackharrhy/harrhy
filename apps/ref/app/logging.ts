import {
  createLogger,
  currentLog,
  jsonSink,
  type Log,
  type LogFields,
  type Logger,
} from "@harrhy/logger";
import { Route, type RouteMap } from "remix/routes";
import { createMultiMatcher } from "remix/route-pattern/match";
import { routes } from "./routes.ts";
import { buildInfo } from "./build-info.ts";

export const logger = createLogger({
  service: "ref",
  ...buildInfo,
  sink: jsonSink,
});

const matchers = new Map<
  string,
  ReturnType<typeof createMultiMatcher<string>>
>();
function register(map: RouteMap, prefix = "ref") {
  for (const [name, value] of Object.entries(map)) {
    if (value instanceof Route) {
      let matcher = matchers.get(value.method);
      if (!matcher) {
        matcher = createMultiMatcher<string>();
        matchers.set(value.method, matcher);
      }
      matcher.add(value.pattern, `${prefix}.${name}`);
    } else register(value, `${prefix}.${name}`);
  }
}
register(routes);
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const privateKeys = new Set([
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "bearer",
  "authorization",
  "auth",
  "password",
  "passwd",
  "secret",
  "clientsecret",
  "apikey",
  "key",
  "cookie",
  "session",
  "sessionid",
  "sessionkey",
  "authcode",
  "refsession",
  "code",
  "state",
  "nonce",
  "codeverifier",
  "verifier",
  "codechallenge",
  "signature",
  "sig",
  "credential",
  "credentials",
  "body",
  "payload",
  "content",
]);
const normalizeKey = (key: string) =>
  key.replace(/[-_.[\]]/g, "").toLowerCase();
const privateParameter = (key: string) =>
  privateKeys.has(normalizeKey(key)) ||
  /^(?:xamz|xgoog)/.test(normalizeKey(key));

function safeQueryValue(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      [...url.searchParams.keys()].some(privateParameter)
    )
      return undefined;
  } catch {
    /* Ordinary query values need not be URLs. */
  }
  return value.slice(0, 512);
}

function matchRoute(method: string, url: URL) {
  try {
    return matchers.get(method)?.match(url);
  } catch {
    return undefined;
  }
}

export function requestFields(
  request: Request,
  privateValues: readonly string[] = privateRequestValues(request),
) {
  const url = new URL(request.url);
  const match = matchRoute(
    request.method === "HEAD" ? "GET" : request.method,
    url,
  );
  const fixed = [
    "/health",
    "/ready",
    "/style.css",
    "/favicon.svg",
    "/.well-known/oauth-protected-resource/mcp",
    "/.well-known/oauth-protected-resource/api/archive",
  ];
  const route =
    match?.pattern.toString() ??
    (fixed.includes(url.pathname)
      ? url.pathname
      : url.pathname.startsWith("/assets/")
        ? "/assets/*"
        : "unmatched");
  const fields: Record<string, string | number> = {
    schema_version: 1,
    request_id: crypto.randomUUID(),
    operation:
      match?.data ??
      `ref.${route === "unmatched" ? "unmatched" : route.replace(/[^a-z0-9]+/gi, ".").replace(/^\.|\.$/g, "")}`,
    "http.method": request.method,
    "http.route": route,
    "http.completion": "response",
  };
  for (const [key, value] of Object.entries(match?.params ?? {})) {
    if (value && uuid.test(value)) fields[`resource.${key}`] = value;
  }
  const upstream = request.headers.get("X-Request-Id");
  if (upstream && /^[A-Za-z0-9_-]{1,128}$/.test(upstream))
    fields.upstream_request_id = upstream;
  let count = 0;
  for (const key of new Set(url.searchParams.keys())) {
    if (privateParameter(key)) continue;
    if (++count > 24) {
      fields["http.query.truncated"] = 1;
      break;
    }
    const values = url.searchParams
      .getAll(key)
      .slice(0, 8)
      .map(safeQueryValue)
      .filter(
        (v) =>
          v !== undefined &&
          !privateValues.some((secret) => secret && v.includes(secret)),
      );
    if (values.length)
      fields[`http.query.${key.slice(0, 80)}`] =
        values.length === 1 ? values[0]! : JSON.stringify(values);
  }
  return fields;
}

function privateRequestValues(request: Request): string[] {
  const url = new URL(request.url);
  const values = [...url.searchParams]
    .filter(
      ([key, value]) =>
        privateParameter(key) || safeQueryValue(value) === undefined,
    )
    .map(([, value]) => value);
  const authorization = request.headers.get("Authorization");
  if (authorization)
    values.push(authorization, authorization.replace(/^\S+\s+/, ""));
  for (const cookie of (request.headers.get("Cookie") ?? "").split(";")) {
    const separator = cookie.indexOf("=");
    if (separator >= 0) {
      const value = cookie.slice(separator + 1).trim();
      values.push(value);
      if (cookie.trim().startsWith("ref_oauth") && value.length <= 4096) {
        try {
          const transaction: unknown = JSON.parse(
            atob(value.replace(/-/g, "+").replace(/_/g, "/")),
          );
          if (transaction && typeof transaction === "object") {
            for (const [key, secret] of Object.entries(transaction))
              if (privateParameter(key) && typeof secret === "string")
                values.push(secret);
          }
        } catch {
          /* Invalid cookies remain the auth handler's responsibility. */
        }
      }
    }
  }
  return values.filter(Boolean);
}

export function errorContext(
  error: unknown,
  privateValues: readonly string[] = [],
) {
  function scrub(value: string, limit: number) {
    let text = value;
    for (const secret of privateValues)
      if (secret) text = text.split(secret).join("[private]");
    text = text.replace(/https?:\/\/[^\s<>"']+/g, (raw) => {
      try {
        const url = new URL(raw);
        url.username = "";
        url.password = "";
        for (const key of url.searchParams.keys())
          if (privateParameter(key)) url.searchParams.set(key, "[private]");
        return url.toString();
      } catch {
        return "[private-url]";
      }
    });
    return text
      .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [private]")
      .replace(
        /\b((?:[\w.-]*(?:token|secret|password|cookie|session)[\w.-]*|authorization|code|state|nonce|verifier|code[_-]?verifier|code[_-]?challenge|signature|sig)["']?\s*[=:]\s*["']?)[^\s,;&"'}]+/gi,
        "$1[private]",
      )
      .slice(0, limit);
  }
  return {
    "error.message": scrub(
      error instanceof Error ? error.message : "Unknown failure",
      2048,
    ),
    "error.stack":
      error instanceof Error && error.stack
        ? scrub(error.stack, 8192)
        : undefined,
    "error.cause":
      error instanceof Error && error.cause instanceof Error
        ? scrub(error.cause.message, 2048)
        : undefined,
  };
}

const privateSources = new WeakMap<Log, readonly string[]>();
const requestIds = new WeakMap<Log, string>();
export function openLinkedJob(fields: LogFields, parent = currentLog()) {
  const log = logger.open("job", {
    ...fields,
    job_id: crypto.randomUUID(),
    request_id: parent ? requestIds.get(parent) : undefined,
  });
  if (parent) privateSources.set(log, privateSources.get(parent) ?? []);
  return log;
}
export function failOperation(error: unknown, log = currentLog()) {
  log?.fail(error, errorContext(error, log ? privateSources.get(log) : []));
}

export async function logRequest(
  request: Request,
  handle: (log: Log) => Promise<Response>,
  options: { logger?: Logger; privateValues?: readonly string[] } = {},
): Promise<Response> {
  const secrets = [
    ...privateRequestValues(request),
    ...(options.privateValues ?? []),
  ];
  const fields = requestFields(request, secrets);
  return (options.logger ?? logger).open("request", fields).run(async (log) => {
    privateSources.set(log, secrets);
    requestIds.set(log, fields.request_id as string);
    let response: Response;
    try {
      response = await handle(log);
    } catch (error) {
      log.fail(error, errorContext(error, secrets));
      response = new Response("Internal Server Error", { status: 500 });
    }
    log.set({
      "http.status": response.status,
      "http.completion": response.status === 101 ? "upgrade" : "response",
    });
    if (response.status >= 500 && log.outcome !== "error")
      log.fail(new Error("HTTP server failure"), {
        "error.code": "HTTP_SERVER_ERROR",
      });
    else if (response.status >= 400 && log.outcome === "ok")
      log.warn("http.rejected");
    // Preserve the actual upgrade response and its webSocket capability.
    if (response.status === 101) {
      try {
        response.headers.set("X-Request-Id", fields.request_id as string);
      } catch {
        log.note("response.request_id_header_unavailable");
      }
      return response;
    }
    const headers = new Headers(response.headers);
    headers.set("X-Request-Id", fields.request_id as string);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
}
