---
name: writing-p2-plugins
description: Write, apply and show a p2 plugin (shared or persistent features, multiplayer games, boards, editors several people use, server-side objects, tools for the agent). Use when the user wants something multiplayer, persistent or with rules inside p2.
---

# Writing p2 plugins

A p2 plugin is a directory of TypeScript files that p2 builds and loads into its server, every session's worker and
the page. Plugins you write live in the **user plugin root**, `<data>/plugins/` on the p2 server (the `local:`
directory this skill's subagent works in). They survive p2 updates; a built-in plugin wins a name clash.

Use a plugin for anything multiplayer, persistent or with rules: games, shared boards, editors several people use.

## Where to work

Work on the server's own files: as a subagent located at `local:<data>/plugins` (subagent `env: null`, `cwd` the
root), or in a session there. Write files with the ordinary `write`/`edit`/`read`/`bash` tools. Saving applies
nothing; `reload_plugins` does.

## Layout

```
<name>/                   lowercase letters, digits, dashes; not a built-in plugin's name
  package.json            { "name": "<name>", "private": true, "type": "module" }   (name = directory)
  contract.ts             the types the other files share (no facet: imported by them)
  server.ts               runs on the server (shared state, rules)
  worker.ts               optional: runs in each session's worker (tools for the agent)
  web.tsx                 optional: runs in the page (React sheets)
  skills/<skill>/SKILL.md optional: skills for agents on the server's machine (see below)
```

Imports: only `@p2/app/v1` (any facet), `@p2/app/v1/server` (server), `@p2/app/v1/worker` (worker),
`@p2/app/v1/web` (web), `@earendil-works/pi-schema`, `@earendil-works/pi-durable` (worker, for
`defineExtension`), `react` (web), and the plugin's own files by relative path. No other packages, no top-level
await, no `import.meta`. `pluginFile(path)` from `@earendil-works/chord/plugins` gives a facet the absolute path of
a file of its own plugin.

## The pieces

- **Contract** (`contract.ts`): `remote(name, { version, params, hostAddress: serverHost, variants })`. Each variant
  has `state` (JSON schemas from `@earendil-works/pi-schema`), `methods` (`method(args, result)`) and `events`
  (fire-and-forget values for motion: pointers, drags, game inputs; never kept or replayed). Every change of a
  contract's shape bumps its `version`.
- **Server object** (`server.ts`): `export default defineFacet((host) => { host.serve(Contract, (params, principal,
  self) => ({ variant, members })) })`. Check the principal: `canView`/`canSend(principal, session)` for people,
  `isWorker(principal) && principal.session === session` for the session's agent. Persistent data lives in a local
  store served once (`local(name, { version, params: {}, members })` with
  `self.state(defineState(name, { schema, version, initial, keyed?, persist: true, checkpointWhen }))`, changed with
  `handle.change(key, draft => ..., ctx)`); each person's object reaches it with `self.get(Store, {})` and shows
  derives (`self.derive([sources], fn)`). Data that belongs to one session is keyed by the session's address
  (`keyed: Session` from `@p2/app/v1`, keys `Session({ id })`): a session's export, import and delete carry it. Events: `self.events<T>()`, `.emit(value)`; listening to a reference's
  event member: `await ref.member.on(listener, ctx)`. Presence: `host.references(Contract)` lists who holds which
  object now.
- **Sheet** (`web.tsx`): `contribute(host, "<name>.web", (self) => { self.contribute(Slots, { "overlay:<name>": Sheet });
  self.contribute(Commands, { ... }) })`. The slot component renders a `Sheet` (from `@p2/app/v1/web`) while
  `useSheet("<name>")` says it is the top layer; a command whose action runs
  `openLayer({ kind: "sheet", name: "<name>" })` opens it from the command menu. The component holds objects with
  `useObject(Contract, params)`, `liveIn(ref, variant)`, `useReadable(member)`; `useRoute().session` is the open
  session.
- **One script per plugin:** each plugin's web facet is built into a script of its own, and a file it imports from
  another plugin is copied into it. Never share module state (a `Map`, a `let`, a store, a React context) through such
  a file: the other plugin's copy is another instance. Use a registry the owning plugin serves, or
  `sharedContext(name, initial)` from `@p2/app/v1/web` for a React context. A plugin's web change applies in open pages
  in place (no reload).
- **Tools** (`worker.ts`): `defineExtension({ name, namespace, tools: [defineP2Tool({...})] })` contributed to
  `Extensions`. A plugin's tool is **code-mode only by default**: give it `callers: ["tools"]`, so it stays out of
  the model's tool list and scripts call it (`await tools.<name>(args)` in `codemode`). The extension's `namespace`
  (`{ name, description, instructions? }`) groups its tools in code mode: the prompt lists the namespace's name and
  one-line description, and `describeNamespace(name)` gives its instructions and tools. To offer a tool in the main
  list instead, leave out `callers`; do that only for a tool the agent needs in most turns.
- **Skills**: a worker facet contributes its plugin's skills directory:
  `self.contribute(PluginSkills, { <name>: { dir: pluginFile("skills") } })` (`PluginSkills` from
  `@p2/app/v1/worker`). Agents on the server's machine see them in `<available_skills>` after the environment's and
  the project's skills; agents on other environments do not (the files stay on the server).

## Apply and show

1. `reload_plugins` (no arguments: every changed plugin and every plugin of the user root; or `{"plugins": [names]}`)
   builds and rolls out to the server, every session's worker and the page (open pages reload onto the new bundle by
   themselves). It reports per plugin: `applied`, `removed`, `failed` with the errors as `file:line:column: message`,
   or `refused` with the reason (an invalid `package.json`, a built-in's name), and errors logged meanwhile. A failed
   build applies nothing; the old code keeps running. Fix and reload again.
2. Show it: the person opens the command your web facet registered from the command menu (Cmd+K).

Edits reload in place: objects people hold go on with the new code.

## Complete example

`example/counter/` next to this file is a complete, tested plugin: a shared counter with presence (who has the sheet
open), a wave event, a sheet and a code-mode tool in its namespace. Copy it to `<root>/counter/` (`cp -r`), run
`reload_plugins`, then open **Counter** from the command menu. Read its files before writing your own.
