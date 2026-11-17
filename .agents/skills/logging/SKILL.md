---
title: "Wide-event logging"
path: /skill/
name: harrhy-wide-event-logging
description: Review and implement context-rich completion events using Harrhy's existing logger.
license: MIT
---
# Wide-event logging

Approved for the Ref pilot. Broader rollout requires review.

## Reuse the existing logger

Read workspace guidance and actual request/job boundaries. Configure `@harrhy/logger` once per service with environment/build identity. Reuse the active record in middleware and handlers; accumulate through `set`, `inc`, `time` and bounded notes. Bridge Remix request context to ambient `currentLog()`; bind deferred callbacks at lifecycle boundaries, never pass loggers through business APIs or component props. Check runtime compatibility and current logger limitations before changing code.

## Build context, emit once

Own one canonical completion event per request per service. Initialize at ingress, enrich during processing, and emit once in a finally-equivalent path. Middleware owns timing, final status and emission; handlers add business context. Avoid scattered progress logs and duplicate request records.

Include consistent fields:

- `timestamp`, `service`, `environment`, `version` (build).
- `kind`, `operation`, `request_id` or `job_id`; existing trace context when available.
- `http.method`, route template `http.route`, final `http.status` where applicable.
- `outcome` (`ok`, `degraded`, `error`) and numeric `duration_ms`.
- Useful actor/resource IDs, counts, dependency timings, retry attempts and error context.

Keep high-cardinality IDs searchable fields, not stream labels. Generate or validate bounded correlation IDs at trusted ingress and propagate through supported interfaces. Omit unavailable values.

Capture enough context to explain success or failure, including safe error type, code, message and useful controlled stack. Log useful ordinary query parameters by default as bounded named fields. Omit actual private/secret values: common credential keys plus application-specific tokens, auth codes, session identifiers, passwords, signed URLs and sensitive user payloads. Never dump cookies, credentials or raw bodies. Keep query fields out of stream labels.

Record actual HTTP status and business outcome separately: returned 5xx and HTTP-200 MCP tool errors must not appear successful. Follow real async boundaries: jobs/attempts own linked completion events; WebSockets need bounded operation/lifecycle events; returning a streaming Response does not mean delivery finished. Use the app’s actual Remix/runtime integration.

## Keep output simple and safe

Default production output to one JSON object per line on stdout/stderr; optional pretty formatting is for development. Keep collection separate from handlers. Add a bounded native shipper only for an actual host need. Serialization or sink failure must never replace the application result or original exception.

Sample at completion only when needed; retain failures, degraded and slow operations.

## Verify

Use deterministic synthetic tests for one event on success, caught/thrown errors and returned error statuses; verify correlation/context isolation, JSON parsing, secret omission, sampling retention and sink-failure isolation.

Adapted from Boris Tane’s [Logging Best Practices Skill](https://github.com/boristane/agent-skills/blob/main/skills/logging-best-practices/SKILL.md) (MIT).
