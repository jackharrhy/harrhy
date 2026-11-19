import { randomUUID } from "node:crypto";
import { createLogger, currentLog, jsonSink } from "@harrhy/logger";

const logger = createLogger({
  service: "auth",
  environment: process.env.NODE_ENV,
  version: process.env.HARRHY_AUTH_VERSION,
  sink: jsonSink,
});
const requestIds = new WeakMap();
const routes = new Set([
  "/",
  "/healthz",
  "/login",
  "/logout",
  "/authorize",
  "/device",
  "/account",
  "/account/email",
  "/account/email/resend",
  "/account/password",
  "/account/sessions",
  "/account/sessions/end",
  "/enroll",
  "/enroll/continue",
  "/enroll/complete",
  "/internal/oidc/authorize-policy",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/invitation",
  "/manage",
  "/support/handoff",
  "/support/callback",
  "/support/redeem",
  "/support/session",
  "/support/end",
]);

export function markRequestRoute(path) {
  const route = routes.has(path)
    ? path
    : path.startsWith("/assets/")
      ? "/assets/*"
      : /^\/apps\/[^/]+$/.test(path)
        ? "/apps/:id"
        : /^\/manage\/people\/[^/]+\/support$/.test(path)
          ? "/manage/people/:id/support"
          : path.startsWith("/manage/")
            ? "/manage/*"
            : "unmatched";
  currentLog()?.set({ "http.route": route });
}

export function currentRequestId() {
  return requestIds.get(currentLog());
}

export function logRequests(listener) {
  return (request, response) => {
    const requestId = randomUUID();
    response.setHeader("X-Request-Id", requestId);
    const record = logger.open("request", {
      operation: "auth.request",
      request_id: requestId,
      "http.method": request.method,
    });
    requestIds.set(record, requestId);
    void record.run(
      (log) =>
        new Promise((resolve) => {
          function complete() {
            response.off("finish", complete);
            response.off("close", complete);
            const status = response.headersSent
              ? response.statusCode
              : undefined;
            log.set({ "http.status": status });
            if (!response.writableFinished) log.warn("http.response_aborted");
            if (status >= 500) log.fail(undefined);
            else if (status >= 400) log.warn("http.response_rejected");
            resolve();
          }
          response.once("finish", complete);
          response.once("close", complete);
          listener(request, response);
        }),
    );
  };
}
