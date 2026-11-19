# Harry Sluggers direction

[Harry Sluggers](../apps/harry-sluggers/README.md) is a read-only Remix site over the historical PostgreSQL data. It does not replace the original runtime or write to that database. The [visual research](ui/sluggers-research.md) records the reference sources and asset boundaries.

## Future league workflows

- Treat each league as a tenant. Scope seasons, teams, matches, imports, storage, and permissions explicitly. Keep global identity separate from league roles, and test cross-league denial with overlapping team names and a multi-league user. Keep frozen match appearances independent of current rosters.
- Use Jack Auth and verified issuer/subject links. Do not join legacy Discord identities by names or unverified email. If Discord sign-in is needed, add it through Auth rather than introducing another identity system.
- Keep the [Stat Tracker](https://github.com/isThatC2/Sluggers-Stat-Tracker) external. Start with the operator’s existing XLSX/log exports. Verify the release and collect complete and partial examples before writing the parser; cached formulas, filenames, and display names do not prove match identity or completeness.
- Prove scheduled match → upload → commissioner review → confirmed publication of the box score and standings before adding structured export or direct submission. Keep emulator control, launchers, and live capture out of the website.

Before migrating data, settle team identity across seasons, correction and publication rules, and import storage. Preserve historical lineups, results, statistics, drafts, trades, chemistry, and verified identity links. Rehearse mappings and rollback against copies without changing the historical site or source database.
