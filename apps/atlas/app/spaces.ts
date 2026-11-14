/** Stable ownership registry; adjacent private content is never discovered. */
export const spaces = [
  { id: "wonder", name: "Wonder", directory: "wonder", legacyRoutes: true },
  {
    id: "pi-handyman",
    name: "Pi Handyman",
    directory: "pi-handyman",
    optional: true,
  },
  {
    id: "media-mogul",
    name: "Media Mogul",
    directory: "media-mogul",
    optional: true,
  },
  { id: "infra", name: "Infra", directory: "infra", optional: true },
  { id: "obsidian", name: "Obsidian", directory: "obsidian", optional: true },
  { id: "mailman", name: "Mailman", directory: "mailman", optional: true },
] as const;

export function spacePath(id: string) {
  return `/spaces/${id}`;
}
