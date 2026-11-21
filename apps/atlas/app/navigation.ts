export interface DirectoryPage {
  readonly path: string;
  readonly title: string;
  readonly parent?: string;
}
export interface DirectoryEntry extends DirectoryPage {
  readonly children: readonly DirectoryEntry[];
}

/** Only published canonical pages participate; explicit metadata wins over URL ancestry. */
export function pageDirectory(pages: readonly DirectoryPage[], home: string): DirectoryEntry[] {
  const entries = pages
    .filter((page) => page.path !== home)
    .toSorted((a, b) => a.title.localeCompare(b.title, "en") || a.path.localeCompare(b.path, "en"));
  const byPath = new Map(entries.map((page) => [page.path, page]));
  const parents = new Map<string, string | undefined>();
  for (const page of entries) {
    const parent =
      page.parent ??
      entries
        .filter((candidate) => candidate.path !== page.path && page.path.startsWith(candidate.path))
        .toSorted((a, b) => b.path.length - a.path.length)[0]?.path;
    parents.set(page.path, parent && byPath.has(parent) ? parent : undefined);
  }
  for (const page of entries) {
    const visited = new Set([page.path]);
    let parent = parents.get(page.path);
    while (parent) {
      if (visited.has(parent)) {
        parents.set(page.path, undefined);
        break;
      }
      visited.add(parent);
      parent = parents.get(parent);
    }
  }
  function children(parent?: string): DirectoryEntry[] {
    return entries
      .filter((page) => parents.get(page.path) === parent)
      .map((page) => {
        const nested = children(page.path);
        return {
          ...page,
          children: nested,
        };
      });
  }
  return children();
}

export const navigationScript = `
const form = document.querySelector('[data-atlas-space-picker]');
if (form) {
  form.addEventListener('change', () => form.requestSubmit());
  form.querySelector('button').remove();
  form.dataset.enhanced = '';
}
`;
