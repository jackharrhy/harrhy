import { createHmac, timingSafeEqual } from "node:crypto";
import {
  createIdentityClient,
  createLoginTransaction,
  IdentityError,
  loginTransactionCookieName,
  validLoginTransaction,
} from "@harrhy/identity";

export interface SlidesAuthEnv {
  HARRHY_SLIDES_ORIGIN?: string;
  HARRHY_SLIDES_SESSION_SECRET?: string;
  HARRHY_SLIDES_PRESENTER_WRITES?: string;
  HARRHY_AUTH_ISSUER?: string;
  HARRHY_AUTH_CLIENT_ID?: string;
  HARRHY_AUTH_PROJECT_ID?: string;
  HARRHY_AUTH_ORGANIZATION_ID?: string;
  HARRHY_AUTH_OWNER_SUBJECT?: string;
}

interface ResponseOptions {
  location?: string;
  cookies?: string[];
  allow?: string;
}

const sessionName = "__Host-slides_session";
const now = () => Math.floor(Date.now() / 1000);

function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function respond(
  status: number,
  body: string | null = null,
  { location, cookies = [], allow }: ResponseOptions = {},
) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  if (location) headers.set("Location", location);
  if (allow) headers.set("Allow", allow);
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(body, { status, headers });
}

function validConfigValue(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.trim() === value
  );
}

export function createSlidesAuth(env: SlidesAuthEnv) {
  const origin = env.HARRHY_SLIDES_ORIGIN;
  const sessionSecret = env.HARRHY_SLIDES_SESSION_SECRET;
  const owner = env.HARRHY_AUTH_OWNER_SUBJECT;
  const issuer = env.HARRHY_AUTH_ISSUER;
  const clientId = env.HARRHY_AUTH_CLIENT_ID;
  const projectId = env.HARRHY_AUTH_PROJECT_ID;
  const organizationId = env.HARRHY_AUTH_ORGANIZATION_ID;

  function configure() {
    try {
      if (typeof origin !== "string") return;
      const url = new URL(origin);
      if (
        url.origin === origin &&
        url.protocol === "https:" &&
        typeof sessionSecret === "string" &&
        sessionSecret.trim() === sessionSecret &&
        Buffer.byteLength(sessionSecret) >= 32 &&
        validConfigValue(owner) &&
        owner.length <= 512 &&
        validConfigValue(issuer) &&
        validConfigValue(clientId) &&
        validConfigValue(projectId) &&
        validConfigValue(organizationId) &&
        new URL(issuer).protocol === "https:"
      ) {
        const identity = createIdentityClient({
          issuer,
          clientId,
          projectId,
          organizationId,
        });
        return { identity, secret: sessionSecret };
      }
    } catch {
      // Invalid configuration disables auth without disabling the public deck.
    }
  }

  const config = configure();
  const callbackUri = `${origin}/auth/callback`;
  const audience = [origin, issuer, clientId, projectId, organizationId];

  function mac(secret: string, name: string, payload: string) {
    return createHmac("sha256", secret)
      .update(JSON.stringify(["slides-auth-v1", audience, name, payload]))
      .digest();
  }

  function seal(secret: string, name: string, value: object) {
    const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${payload}.${mac(secret, name, payload).toString("base64url")}`;
  }

  function open(secret: string, request: Request, name: string): unknown {
    const prefix = `${name}=`;
    const matches = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((item) => item.trim())
      .filter((item) => item.startsWith(prefix));
    if (matches.length !== 1 || matches[0].length > 4000) return null;
    const match = /^([\w-]+)\.([\w-]{43})$/.exec(
      matches[0].slice(prefix.length),
    );
    if (!match) return null;
    const [, payload, tag] = match;
    const supplied = Buffer.from(tag, "base64url");
    if (
      supplied.toString("base64url") !== tag ||
      !timingSafeEqual(supplied, mac(secret, name, payload))
    )
      return null;
    try {
      return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      return null;
    }
  }

  const onOrigin = (request: Request) => new URL(request.url).origin === origin;
  function guard(request: Request, method: string) {
    if (!onOrigin(request)) return respond(403, "Wrong Slides origin");
    if (request.method !== method)
      return respond(405, "Method not allowed", { allow: method });
  }

  return {
    enabled: Boolean(config),
    async isPresenter(request: Request) {
      if (!config || !onOrigin(request)) return false;
      const session = open(config.secret, request, sessionName);
      return (
        typeof session === "object" &&
        session !== null &&
        "subject" in session &&
        session.subject === owner &&
        "expiresAt" in session &&
        typeof session.expiresAt === "number" &&
        Number.isSafeInteger(session.expiresAt) &&
        session.expiresAt > now()
      );
    },

    async login(request: Request) {
      if (!config) return respond(503, "Sign-in is unavailable");
      const denied = guard(request, "GET");
      if (denied) return denied;
      try {
        const transaction = createLoginTransaction();
        const name = `__Host-${loginTransactionCookieName("slides_oauth", transaction.state)}`;
        const location = await config.identity.authorizationUrl(
          transaction,
          callbackUri,
        );
        return respond(303, null, {
          location,
          cookies: [cookie(name, seal(config.secret, name, transaction), 600)],
        });
      } catch {
        return respond(503, "Sign-in is unavailable");
      }
    },

    async callback(request: Request) {
      if (!config) return respond(503, "Sign-in is unavailable");
      const denied = guard(request, "GET");
      if (denied) return denied;
      const params = new URL(request.url).searchParams;
      const state = params.get("state");
      const key = loginTransactionCookieName("slides_oauth", state);
      if (!key || params.getAll("state").length !== 1)
        return respond(400, "Invalid sign-in transaction");
      const name = `__Host-${key}`;
      const cookies = [cookie(name, "", 0)];
      const transaction = open(config.secret, request, name);
      const code = params.get("code");
      if (
        !validLoginTransaction(transaction, state) ||
        !code ||
        params.getAll("code").length !== 1 ||
        params.has("error")
      ) {
        return respond(400, "Invalid sign-in transaction", { cookies });
      }
      try {
        // The issuer consumes the code; every callback response clears the browser transaction.
        const profile = await config.identity.exchange(
          code,
          transaction,
          callbackUri,
          {
            requiredRole: "slides-presenter",
          },
        );
        if (profile.subject !== owner)
          return respond(403, "Presenter access is not assigned", { cookies });
        const issuedAt = now();
        const expiresAt = Math.min(profile.expiresAt, issuedAt + 3600);
        if (!Number.isSafeInteger(expiresAt) || expiresAt <= issuedAt) {
          return respond(401, "Sign-in could not be completed", { cookies });
        }
        cookies.push(
          cookie(
            sessionName,
            seal(config.secret, sessionName, {
              subject: profile.subject,
              expiresAt,
            }),
            expiresAt - issuedAt,
          ),
        );
        return respond(303, null, { location: "/", cookies });
      } catch (error) {
        const status = error instanceof IdentityError ? error.status : 503;
        return respond(status, "Sign-in could not be completed", { cookies });
      }
    },

    logout(request: Request) {
      if (!config) return respond(503, "Sign-in is unavailable");
      const denied = guard(request, "POST");
      if (denied) return denied;
      if (request.headers.get("origin") !== origin)
        return respond(403, "Wrong Slides origin");
      return respond(303, null, {
        location: "/",
        cookies: [cookie(sessionName, "", 0)],
      });
    },
  };
}
