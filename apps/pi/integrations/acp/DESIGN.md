# ACP delegation in Pi

**Decision:** Pi is an ACP client. Start with Google's official Antigravity CLI and use its documented `agy acp` mode, as [T3 Code does for Antigravity](https://github.com/pingdotgg/t3code/pull/32503). Antigravity owns model routing, tools and authentication. Pi delegates to it as a tool; Gemini does not become a Pi chat model. No ADK, OAuth token import, quota proxy or terminal scraping.

[Google ended Gemini CLI consumer sign-in](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals) on June 18, 2026. Antigravity is its supported successor for Google AI Pro and Ultra. [Google documents Antigravity's ACP endpoint for other clients](https://antigravity.google/docs/ide/extensions/acp/), including the stdio command and protocol version. [Pi as an ACP agent](https://zed.dev/acp/agent/pi) is prior art in the other direction. Google has [announced Neon in Antigravity](https://antigravity.google/blog/gemini-4-neon-in-google-antigravity/), but the account and CLI must tell us which models they expose.

## First slice: prove the wire and the account

- Optional plugin from `main`, independent of Cursor PR #336. An operator selects a trusted Antigravity CLI executable and disposable workspace. The only invocation is a literal executable with the argument `acp`; the tool caller cannot set the command, flags, credentials or workspace.
- One foreground `acp_task` at a time. Initialize, open an ACP session, send one prompt, collect bounded text, then stop the child. No persistence, registry installation, auto-retry, or reuse of a provider session in this slice.
- Deny permission requests and offer no client terminal or filesystem capability. This is **not** OS confinement: the external agent itself runs with the service user's rights. Test in a disposable instance with synthetic files and no production credentials. The agent's final text is untrusted input.
- Test with a fake stdio agent first. Then try Google's official CLI with a test prompt and an authorized sign-in. Read the session's advertised configuration to learn what it can select; distinguish authentication, quota and model availability from protocol errors. Don't ask Pi to handle a login token.

## Next slice: durable tasks, after a real smoke test

Use the Cursor run pattern as a reference without coupling the integrations: a detached supervisor owns the child and stdio stream; the server owns admissions and run records; a wake reports settlement to the originating conversation. Carry a stable run ID, deadlines, partial output, session ownership, and caps across reloads. A resumed ACP session is capability-dependent (`session/load` or the negotiated resume method), not a guaranteed equivalent to a Cursor reattach. Do not replay a prompt automatically if we can't tell whether it ran.

Add an owner-only settings surface once the proof works: one Gemini preset, then literal commands for additional explicitly trusted agents. Expand through a second real agent before factoring out shared supervision or adding Registry downloads. Keep permissions, sandboxing and supported operations explicit per agent. Keep Cursor working independently until we have evidence ACP can cover its actual use cases.
