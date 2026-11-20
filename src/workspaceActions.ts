import type { EditorValue } from './Editor';
import type { Workspace } from './model';

function replaceItem<T extends { id: string }>(items: T[], item: T) {
  return items.some((entry) => entry.id === item.id) ? items.map((entry) => entry.id === item.id ? item : entry) : [item, ...items];
}

export function saveEntry(data: Workspace, value: EditorValue): Workspace {
  if (value.kind === 'project') return { ...data, projects: replaceItem(data.projects, value.item) };
  if (value.kind === 'snippet') return { ...data, snippets: replaceItem(data.snippets, value.item) };
  return { ...data, notes: replaceItem(data.notes, value.item) };
}

export function deleteEntry(data: Workspace, value: EditorValue): Workspace {
  const { id } = value.item;
  if (value.kind === 'project') return {
    ...data,
    projects: data.projects.filter((project) => project.id !== id),
    notes: data.notes.map((note) => note.projectId === id ? { ...note, projectId: '' } : note),
  };
  if (value.kind === 'snippet') return { ...data, snippets: data.snippets.filter((snippet) => snippet.id !== id) };
  return { ...data, notes: data.notes.filter((note) => note.id !== id) };
}

function appendImported<T extends { id: string }>(current: T[], incoming: T[], replacementIds: Map<string, string>) {
  const byId = new Map(current.map((item) => [item.id, item]));
  const mappedIds = new Map<string, string>();
  const additions: T[] = [];
  for (const item of incoming) {
    const existing = byId.get(item.id);
    const identical = existing && (Object.keys(item) as (keyof T)[]).every((key) =>
      JSON.stringify(item[key]) === JSON.stringify(existing[key]));
    if (identical) {
      mappedIds.set(item.id, item.id);
      continue;
    }
    const id = existing ? replacementIds.get(item.id)! : item.id;
    mappedIds.set(item.id, id);
    additions.push({ ...item, id });
  }
  return { items: [...current, ...additions], mappedIds };
}

export function importEntries(incoming: Workspace) {
  // Allocate IDs outside the optimistic reducer so retries preserve the same project links.
  const replacements = (items: { id: string }[]) => new Map(items.map(({ id }) => [id, crypto.randomUUID()]));
  const projects = replacements(incoming.projects);
  const snippets = replacements(incoming.snippets);
  const notes = replacements(incoming.notes);
  return (workspace: Workspace): Workspace => {
    const projectResult = appendImported(workspace.projects, incoming.projects, projects);
    const linkedNotes = incoming.notes.map((note) => ({
      ...note,
      projectId: projectResult.mappedIds.get(note.projectId) ?? '',
    }));
    return {
      ...workspace,
      projects: projectResult.items,
      snippets: appendImported(workspace.snippets, incoming.snippets, snippets).items,
      notes: appendImported(workspace.notes, linkedNotes, notes).items,
    };
  };
}
