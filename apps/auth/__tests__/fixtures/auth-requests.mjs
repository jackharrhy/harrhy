import assert from "node:assert/strict";

// Auth's SSR sends double-quoted attributes. Only extract the hidden values
// emitted by a particular form, rather than approximating a browser DOM.
function attr(tag, key) {
  const value = tag.match(new RegExp(`\\s${key}="([^"]*)"`))?.[1];
  return value?.replace(
    /&(amp|quot|lt|gt|#39|#x27);/g,
    (_, entity) =>
      ({
        amp: "&",
        quot: '"',
        lt: "<",
        gt: ">",
        "#39": "'",
        "#x27": "'",
      })[entity],
  );
}

export function hiddenFields(html, action, required = {}) {
  for (const [form, open] of html.matchAll(
    /(<form\b[^>]*>)[\s\S]*?<\/form>/g,
  )) {
    if (attr(open, "action") !== action) continue;
    const fields = {};
    for (const [input] of form.matchAll(/<input\b[^>]*>/g)) {
      if (attr(input, "type") === "hidden")
        fields[attr(input, "name")] = attr(input, "value");
    }
    if (Object.entries(required).every(([key, value]) => fields[key] === value))
      return fields;
  }
  assert.fail(`Missing form for ${action} (${JSON.stringify(required)})`);
}

export function authClient({ origin, fetch }) {
  const cookies = new Map();
  async function request(path, { form, requestOrigin = origin } = {}) {
    const url = new URL(path, origin);
    assert.equal(url.origin, origin);
    const headers = new Headers({ cookie: [...cookies.values()].join("; ") });
    if (form) headers.set("origin", requestOrigin);
    const body = form ? new URLSearchParams(form) : undefined;
    const response = await fetch(
      new Request(url, { method: form ? "POST" : "GET", headers, body }),
    );
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(";")[0];
      const name = pair.split("=")[0];
      if (/;\s*Max-Age=0\b/i.test(value)) cookies.delete(name);
      else cookies.set(name, pair);
    }
    return response;
  }
  async function get(path, status = 200) {
    const response = await request(path);
    assert.equal(response.status, status, String(path));
    return response.text();
  }
  async function login(
    username,
    password = "fixture-password",
    path = "/login",
  ) {
    const form = hiddenFields(await get(path), "/login");
    const response = await request("/login", {
      form: { ...form, username, password },
    });
    assert.equal(response.status, 303);
    return response;
  }
  return { get, request, login };
}
