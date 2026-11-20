export const statuses = ['In Progress', 'Testing', 'Deployed', 'On Hold'] as const;
export type Status = typeof statuses[number];
export type Theme = 'light' | 'dark' | 'system';
export type View = 'Overview' | 'Projects' | 'Snippets' | 'Notes' | 'Settings';
export type Kind = 'project' | 'snippet' | 'note';

interface Entry {
  id: string;
  title: string;
  updatedAt: string;
}

export interface Project extends Entry {
  description: string;
  tags: string[];
  status: Status;
  path: string;
}

export interface Snippet extends Entry {
  category: string;
  content: string;
}

export interface Note extends Entry {
  topic: string;
  projectId: string;
  content: string;
}

export interface Workspace {
  projects: Project[];
  snippets: Snippet[];
  notes: Note[];
  theme: Theme;
}

export type EditorState =
  | { kind: 'project'; item?: Project }
  | { kind: 'snippet'; item?: Snippet }
  | { kind: 'note'; item?: Note };

export function updatedFirst<T extends Pick<Entry, 'updatedAt'>>(items: T[]) {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const statusClass: Record<Status, string> = {
  'In Progress': 'progress',
  Testing: 'testing',
  Deployed: 'deployed',
  'On Hold': 'hold',
};

export function displayDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

export function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Workspace>;
  const strings = (item: unknown, ...keys: string[]) =>
    Boolean(item && typeof item === 'object' && keys.every((key) => typeof (item as Record<string, unknown>)[key] === 'string'));
  const entry = (item: unknown): item is Entry =>
    strings(item, 'id', 'title', 'updatedAt') && Number.isFinite(Date.parse((item as Entry).updatedAt));
  return (
    Array.isArray(candidate.projects) &&
    candidate.projects.every((item) => entry(item) && strings(item, 'description', 'path') &&
      statuses.includes(item.status) && Array.isArray(item.tags) && item.tags.every((tag: unknown) => typeof tag === 'string')) &&
    Array.isArray(candidate.snippets) && candidate.snippets.every((item) => entry(item) && strings(item, 'category', 'content')) &&
    Array.isArray(candidate.notes) && candidate.notes.every((item) => entry(item) && strings(item, 'topic', 'projectId', 'content')) &&
    (candidate.theme === 'light' || candidate.theme === 'dark' || candidate.theme === 'system')
  );
}
