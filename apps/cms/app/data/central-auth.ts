import {
  createIdentityClient,
  createLoginTransaction,
  IdentityError,
  validLoginTransaction,
  type IdentityConfig,
  type LoginTransaction,
} from "@harrhy/identity";

export type CentralAuth = {
  config: IdentityConfig;
  origin: string;
  ownerSubject: string;
};

const pending = new WeakMap<
  CentralAuth,
  Map<
    string,
    {
      transaction: LoginTransaction;
      callbackPath: string;
      cookieName: string;
      expires: number;
    }
  >
>();

export function centralAuth(
  origin: string,
  clientId: string | undefined,
): CentralAuth | null {
  const issuer = process.env.HARRHY_AUTH_ISSUER;
  if (!issuer) return null;
  const projectId = process.env.HARRHY_AUTH_PROJECT_ID;
  const organizationId = process.env.HARRHY_AUTH_ORGANIZATION_ID;
  const ownerSubject = process.env.HARRHY_AUTH_OWNER_SUBJECT;
  if (!clientId || !projectId || !organizationId || !ownerSubject)
    throw new Error("CMS Auth is incomplete");
  return {
    config: { issuer, clientId, projectId, organizationId },
    origin,
    ownerSubject,
  };
}

function transactionCookie(
  name: string,
  value: string,
  origin: string,
  maxAge: number,
) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${origin.startsWith("https:") ? "; Secure" : ""}`;
}

function cookieValue(request: Request, name: string) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}

export async function beginCentralLogin(
  auth: CentralAuth,
  callbackPath: string,
  cookieName: string,
) {
  let transactions = pending.get(auth);
  if (!transactions) pending.set(auth, (transactions = new Map()));
  for (const [key, item] of transactions)
    if (item.expires <= Date.now()) transactions.delete(key);
  if (transactions.size >= 1000)
    return new Response("Sign-in is busy. Try again later.", { status: 503 });
  const transaction = createLoginTransaction();
  const encoded = transaction.state;
  transactions.set(encoded, {
    transaction,
    callbackPath,
    cookieName,
    expires: Date.now() + 600_000,
  });
  let authorization: string;
  try {
    authorization = await createIdentityClient(auth.config).authorizationUrl(
      transaction,
      `${auth.origin}${callbackPath}`,
    );
  } catch {
    transactions.delete(encoded);
    return new Response("Sign-in is unavailable. Try again later.", {
      status: 503,
    });
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: authorization,
      "Set-Cookie": transactionCookie(cookieName, encoded, auth.origin, 600),
      "Cache-Control": "no-store",
    },
  });
}

export async function finishCentralLogin(
  request: Request,
  auth: CentralAuth,
  callbackPath: string,
  cookieName: string,
) {
  const cleared = transactionCookie(cookieName, "", auth.origin, 0);
  const encoded = cookieValue(request, cookieName);
  const transactions = pending.get(auth);
  const item = transactions?.get(encoded);
  transactions?.delete(encoded);
  const transaction = item?.transaction;
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  if (
    !transaction ||
    !item ||
    item.expires <= Date.now() ||
    item.callbackPath !== callbackPath ||
    item.cookieName !== cookieName ||
    new URL(request.url).origin !== auth.origin ||
    !validLoginTransaction(transaction, params.get("state")) ||
    !code
  )
    return {
      ok: false as const,
      response: new Response("Sign-in could not be completed", {
        status: 400,
        headers: { "Set-Cookie": cleared },
      }),
    };
  try {
    const profile = await createIdentityClient(auth.config).exchange(
      code,
      transaction,
      `${auth.origin}${callbackPath}`,
    );
    if (profile.subject !== auth.ownerSubject)
      return {
        ok: false as const,
        response: new Response("CMS access is not assigned", {
          status: 403,
          headers: { "Set-Cookie": cleared, "Cache-Control": "no-store" },
        }),
      };
    return { ok: true as const, profile, cleared };
  } catch (error) {
    return {
      ok: false as const,
      response: new Response("Sign-in could not be completed", {
        status: error instanceof IdentityError ? error.status : 503,
        headers: { "Set-Cookie": cleared },
      }),
    };
  }
}
