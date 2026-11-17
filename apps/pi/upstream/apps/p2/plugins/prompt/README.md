# Skill discovery

The prompt loader advertises skill names, descriptions and canonical file locations, not bodies. Explicit `/skill:name` invocation reads the body through the conversation's execution environment.

First name wins, in this order:

1. The environment's skills directory (p2's data `skills` locally).
2. The active cwd's `.pi/skills` (legacy).
3. `.agents/skills` at the cwd, then each ancestor, nearest first, including the nearest directory containing a `.git` file or directory. Without a `.git` marker, discovery ends at the filesystem root.
4. Local shared `~/.agents/skills`, then registered plugin skill roots in their existing order.

Each root is searched in sorted entry order. Canonical file paths are deduplicated before reading; names are deduplicated after parsing. Thus a project skill overrides a shared skill with the same name, but explicit environment skills and cwd `.pi` skills retain their existing priority. A shared root encountered in the ancestor walk stays global rather than becoming project instructions.

A directory containing `SKILL.md` is one skill; discovery stops there. Legacy/global/plugin roots also accept loose `.md` files directly at their root. As in upstream's `.agents` discovery, loose `.md` files there are accepted below, not directly at, the root. Hidden entries and `node_modules` are excluded; `.git` is never scanned. Existing frontmatter parsing, invalid-file skipping and file-read policies are unchanged.

Directory symlinks inside a skill tree are followed only when their canonical target is within a registered skill root, excluding hidden and dependency subtrees. This supports CLI-created links to registered shared skills without traversing arbitrary external directories. Canonical directory identities stop cycles. Discovered `.agents`/`skills` roots themselves cannot redirect through symlinks; explicit global/plugin root aliases retain their existing support. File symlinks are not loaded. Unlike upstream, arbitrary external symlink targets and ignore-file rules are not supported.

The observer watches the exact candidate skill roots recursively, including missing roots, rather than sweeping cwd ancestors or the home directory. Discovery revalidates project roots on each load, but the existing watcher follows its target itself: do not retarget an observed root through a symlink while it is being watched. Strict containment against hostile live root replacement needs watcher-level no-follow support; this plugin does not provide it. Existing location handling creates the watches for each active session/subagent cwd and replaces them on moves. Shared/plugin files remain global even when reached through a project alias; locked sessions without global instructions keep only project files, not aliases of global files.
