---
name: pr-description
description: Write or revise pull request titles and descriptions for human readers. Use when opening a PR, preparing it for review, or trimming an existing description.
---

# Pull request descriptions

Read the diff and relevant project guidance. Describe the change a reader receives, not the agent workflow that produced it. Keep small PRs small; add detail only when it helps review.

## Title and opening

Use a short, specific title naming the change. Follow repository title conventions when required. Prefer “Import saved designs” to “Complete phase two implementation.”

Open with one or two short paragraphs explaining what changes and why. Lead with observable behavior: what someone can now do, what problem is fixed, or what becomes easier. For internal work, name the concrete maintenance or correctness benefit. Use ordinary present-tense language and the product’s own terms.

Keep important compatibility changes, destructive consequences and unresolved limitations visible. Do not bury a migration requirement or unverified behavior in implementation notes. Do not imply that source changes are already deployed or that a mocked test proves a real integration.

## Supporting detail

Put useful technical context in a collapsed section:

```markdown
A short explanation of the change and its purpose.

<details>
<summary>Implementation details</summary>

Explain the relevant design choices or boundaries. Include brief test notes
and any useful public issue or source links.

</details>
```

Leave blank lines around Markdown inside the disclosure so GitHub renders paragraphs, lists and fenced blocks correctly. Omit the section when the opening already explains a tiny change.

A GitHub Mermaid diagram can help explain a non-obvious flow or relationship. Put it inside the disclosure, use a fenced `mermaid` block with blank lines before and after it, and check the syntax. Skip it when a sentence is clearer; do not diagram every file or test step.

Summarize relevant validation in a sentence or a few selective notes. State only known results. Mention missing coverage when it matters to confidence; avoid test-count inventories, repeated CI badges, raw logs and execution chronology.

## Leave out

- Agent assignments, approval diaries, run IDs, commit-hash inventories and repeated evidence comments.
- Internal coordination banners such as “REVIEW ONLY” or “DO NOT DEPLOY.” Keep actual review and release controls in the appropriate workflow and coordination channels; editing prose does not change those controls.
- Private preview or knowledge-site links, internal hostnames, local filesystem paths, infrastructure instance names and real account examples. Use generic examples such as Alice or “the configured media server” when an example helps.
- Credentials or other sensitive material. Redact incidental private detail without removing information a reviewer genuinely needs.
- Filler headings, bold-label checklists, repeated summaries and claims that the diff or tests do not support.

Public issue, documentation and source links are useful when they explain the change. Private operational context usually is not useful to the repository’s audience.

## Before publishing

Read the title and opening without the disclosure: can a person understand the change and its purpose? Then check that the supporting detail is accurate, concise and rendered correctly. Remove repetition and AI-sounding filler.

When revising an existing PR, preserve meaningful discussion and edit only metadata or comments you are authorized to change. Do not rewrite other people’s comments or unrelated historical PRs. Read back the published title and body; confirm that no source, approval, merge or deployment state changed as a side effect.
