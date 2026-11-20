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
  return items.map((item) => ({ item, time: Date.parse(item.updatedAt) }))
    .sort((a, b) => b.time - a.time).map(({ item }) => item);
}

export const statusClass: Record<Status, string> = {
  'In Progress': 'progress',
  Testing: 'testing',
  Deployed: 'deployed',
  'On Hold': 'hold',
};

const dates = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
export const displayDate = (value: string) => dates.format(new Date(value));
