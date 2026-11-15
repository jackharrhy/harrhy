# Document navigation

Remix's `run()` intercepts eligible same-origin links and forms, even without an explicit `<Frame>`. A same-origin Auth entry route that redirects to the Auth origin must use document navigation: a frame fetch cannot complete that cross-origin document transition. A refresh working does not mean a hydrated click works.

## Shared convention

Use the existing Remix `data-rmx-document` attribute on Auth entry links and session-changing forms. No routing wrapper, click handler, React `reloadDocument` prop, or extra component is needed.

```tsx
<a href={routes.auth.login.href()} data-rmx-document>Sign in</a>
<form action={routes.logout.href()} method="post" data-rmx-document>
  <button type="submit">Sign out</button>
</form>
```

`@harrhy/ui/native`'s `ButtonLink` accepts native anchor props and forwards this attribute:

```tsx
<ButtonLink href={routes.auth.login.href()} data-rmx-document>
  Sign in
</ButtonLink>
```

Put the attribute on the actual anchor or form, not its container or submit button. Keep the original method, action, hidden fields, CSRF checks, return URL, and OAuth state/PKCE transaction handling. Do not replace forms with GET links or use `fetch()` for a route whose response is a document redirect.

Ordinary internal page links and forms should retain Remix navigation. Direct cross-origin links, native `download` anchors, and new-tab targets already bypass interception; do not mark every link or disable navigation globally. A same-origin download endpoint that redirects elsewhere should expose native download/document intent, rather than depend on a frame fetch. Do not prefetch Auth/session-changing entry routes.

The installed `@remix-run/component` README's **Navigation → Links and Forms** section and `dist/runtime/navigation.js` are the API reference. Sergio's monorepo uses the same native attribute on Auth forms; no separate outlink package is required.

## Regression coverage

Radio's `__tests__/auth-navigation.test.ts` serves its real lobby/document components and built browser entry against two isolated loopback origins. Its mock Auth redirect does not log in, provision an account, or change production data. The tests cover:

- A hydrated same-origin Sign in click reaches the other origin as a document request, without refresh, and works again after Back and keyboard activation.
- Middle-click and Ctrl/Meta-click open a new tab; no-JavaScript clicks and fresh server navigation work.
- Sign out remains a POST document navigation and replaces the old document.
- An ordinary room-selection GET remains client-side and preserves document state.

Build Radio, then run `npm run test:auth-navigation --workspace @harrhy/radio`. The workspace `check` includes it; Chromium is required. Existing Auth controller tests separately cover pending transactions and invalid state. No browser test should complete a production login to exercise this boundary.

## Cross-app audit

Source inspected at `760c3a8` for the Radio fix:

<!-- prettier-ignore -->
| Consumer | Finding |
| --- | --- |
| Radio | Sign in and sign-out form lacked the attribute; fixed with real-browser regression coverage. |
| Shared UI | Native `ButtonLink` forwards anchor props already; no package API change needed. |
| Artbin | Auth entry uses its existing `document` prop, forwarded to the native attribute, with an SSR assertion. Download controls use `download` or a new-tab target. Ordinary `/login` is an internal rendered page, not the OAuth initiator. |
| CMS/operator, Worldview | Inspected Auth entry controls already opt into document navigation. |
| Ref, Auth, 4orm, CMS-edge, Rotund | Inspected sign-in/session documents do not start the Remix navigation runtime; these controls currently navigate natively. Recheck the convention if adding hydration. |
| Burger | Starts `run()`; `/auth/login` anchor and `/auth/logout` form need the same convention in an app-scoped follow-up. |
| Pool | Starts `run()`; `/auth/login` anchor needs the convention in an app-scoped follow-up. Its explicit logout fetch already reloads the document after its JSON/API operation; do not blindly replace that API behavior. |
| Letters to Steve | Starts `run()`; the inbox sign-out form needs the session-boundary convention in an app-scoped follow-up. |

This Radio change does not publish or deploy those follow-up apps, Auth, Ref, or CMS.
