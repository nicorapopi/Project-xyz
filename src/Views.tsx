import { lazy, Suspense, useDeferredValue, useMemo, useRef, useState } from 'react';
import { ChevronRight, Clipboard, FileText, Folder, FolderOpen, HardDrive, Laptop, Moon, Pencil, Plus, Search, Sun, Terminal, Trash2, Upload } from 'lucide-react';
import { CopyButton, Empty, Modal, Pager, ProjectIcon, SelectField, StatusBadge, Tags } from './components';
import { displayDate, statuses, updatedFirst, type Note, type Project, type Snippet, type Theme, type Workspace } from './model';
import { ImportError } from './schema';
import { desktop } from './storage';
import { arrowFocus, usePage } from './useList';
import { mutationMessage } from './useWorkspace';

const NoteMarkdown = lazy(() => import('./NoteMarkdown'));

export function ProjectsView({ projects, onAdd, onOpen, activeOnly }: {
  projects: Project[]; onAdd: () => void; onOpen: (project: Project) => void; activeOnly: boolean;
}) {
  const [status, setStatus] = useState(activeOnly ? 'Active' : '');
  const [tag, setTag] = useState('');
  const [query, setQuery] = useState('');
  const filter = useDeferredValue(query.trim().toLowerCase());
  const indexed = useMemo(() => updatedFirst(projects).map((project) => ({
    project, tags: project.tags.map((tag) => tag.toLowerCase()),
    text: [project.title, project.description, project.path, ...project.tags].join(' ').toLowerCase(),
  })), [projects]);
  const tags = useMemo(() => {
    const options = new Map<string, string>();
    for (const project of projects) for (const tag of project.tags) options.set(tag.toLowerCase(), tag);
    return [...options].sort(([a], [b]) => a.localeCompare(b)).map(([value, label]) => ({ value, label }));
  }, [projects]);
  const filtered = useMemo(() => indexed.filter((entry) => {
    const state = entry.project.status;
    const matchesStatus = status === 'Active' ? state === 'In Progress' || state === 'Testing' : !status || state === status;
    return matchesStatus && (!tag || entry.tags.includes(tag)) && entry.text.includes(filter);
  }), [indexed, status, tag, filter]);
  const pagination = usePage(filtered, 36, JSON.stringify([status, tag, filter]));

  return <>
    <div className="page-heading heading-action"><div><h1>Projects</h1><p>Track your repositories, tech stacks, and progress.</p></div><button className="button secondary" onClick={onAdd}><Plus size={16} /> Add project</button></div>
    <div className="filters">
      <label className="filter-search"><Search size={16} /><input aria-label="Filter projects" placeholder="Filter projects…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <SelectField label="Filter by status" value={status} onChange={setStatus} options={[{ value: '', label: 'All statuses' }, { value: 'Active', label: 'Active' }, ...statuses.map((status) => ({ value: status, label: status }))]} />
      <SelectField label="Filter by tag" value={tag} onChange={setTag} options={[{ value: '', label: 'All tags' }, ...tags]} />
    </div>
    {filtered.length ? <><section className="project-grid" aria-label="Projects" onKeyDown={arrowFocus}>
      {pagination.items.map(({ project }) => <button data-list-entry className="surface project-card" key={project.id} onClick={() => onOpen(project)}>
        <div className="project-card-top"><ProjectIcon id={project.id} /><StatusBadge status={project.status} /></div>
        <h2>{project.title}</h2><p>{project.description || 'No quick notes'}</p><Tags tags={project.tags} />
        <div className="project-card-foot"><Folder size={15} /><span>{project.path || 'No local folder'}</span><ChevronRight size={16} /></div>
      </button>)}
    </section><Pager page={pagination.page} pages={pagination.pages} onChange={pagination.setPage} label="Project pages" /></>
      : <div className="surface"><Empty title={projects.length ? 'No matching projects' : 'No projects yet'}
      text={projects.length ? 'Try adjusting your filters.' : 'Add a project to track its status and local folder.'}
      action={projects.length ? <button className="text-button" onClick={() => { setStatus(''); setTag(''); setQuery(''); }}>Clear filters</button> : <button className="text-button" onClick={onAdd}>Add project</button>} /></div>}
  </>;
}

export function ProjectDetails({ project, notes, onClose, onEdit, onDelete, onCopy, onReveal, onNote }: {
  project: Project; notes: Note[]; onClose: () => void; onEdit: () => void; onDelete: () => void;
  onCopy: () => void; onReveal: () => void; onNote: (note: Note) => void;
}) {
  const pagination = usePage(notes, 20);
  return <Modal title={project.title} onClose={onClose}>
    <div className="project-inspect">
      <div className="project-inspect-head"><ProjectIcon id={project.id} /><StatusBadge status={project.status} /><span>Updated {displayDate(project.updatedAt)}</span></div>
      <Tags tags={project.tags} />
      {project.description && <section><h3>Quick notes</h3><p>{project.description}</p></section>}
      <section><h3>Local folder</h3>
        {project.path ? <div className="path-box"><Folder size={16} /><code>{project.path}</code><CopyButton label="Copy folder path" onClick={onCopy} />
          {desktop && <button className="icon-button" onClick={onReveal} aria-label="Show folder in file manager" title="Show folder in file manager"><FolderOpen size={16} /></button>}</div> : <p>No local folder has been set.</p>}
      </section>
      {notes.length > 0 && <section onKeyDown={arrowFocus}><h3>Linked notes</h3>{pagination.items.map((note) => <button data-list-entry className="linked-note" key={note.id} onClick={() => onNote(note)}><FileText size={15} />{note.title}<ChevronRight size={15} /></button>)}
        <Pager page={pagination.page} pages={pagination.pages} onChange={pagination.setPage} label="Linked note pages" /></section>}
    </div>
    <div className="modal-actions spread"><button className="button delete-button" onClick={onDelete}><Trash2 size={16} /> Delete</button><button className="button primary" onClick={onEdit}><Pencil size={15} /> Edit project</button></div>
  </Modal>;
}

export function SnippetsView({ snippets, onAdd, onEdit, onDelete, onCopy }: {
  snippets: Snippet[]; onAdd: () => void; onEdit: (snippet: Snippet) => void;
  onDelete: (snippet: Snippet) => void; onCopy: (snippet: Snippet) => void;
}) {
  const { groups, categories } = useMemo(() => {
    const groups = new Map<string, { label: string; items: Snippet[] }>();
    for (const snippet of updatedFirst(snippets)) {
      const key = snippet.category.toLowerCase();
      const group = groups.get(key) ?? { label: snippet.category, items: [] };
      group.items.push(snippet);
      groups.set(key, group);
    }
    return { groups, categories: [...groups].sort(([, a], [, b]) => a.label.localeCompare(b.label)) };
  }, [snippets]);
  const [category, setCategory] = useState('');
  const selected = groups.has(category) ? category : '';
  const filtered = useMemo(() => selected ? groups.get(selected)?.items ?? [] : categories.flatMap(([, group]) => group.items), [groups, categories, selected]);
  const pagination = usePage(filtered, 24, selected);
  const visible = new Map<string, Snippet[]>();
  for (const snippet of pagination.items) {
    const key = snippet.category.toLowerCase();
    const items = visible.get(key) ?? [];
    items.push(snippet);
    visible.set(key, items);
  }
  return <>
    <div className="page-heading heading-action"><div><h1>Snippets</h1><p>Keep frequently used commands and reference text in one place.</p></div><button className="button secondary" onClick={onAdd}><Plus size={16} /> Add snippet</button></div>
    <div className="filters"><SelectField label="Filter by category" value={selected} onChange={setCategory}
      options={[{ value: '', label: 'All categories' }, ...categories.map(([key, group]) => ({ value: key, label: group.label }))]} /></div>
    {categories.length ? <>{[...visible].map(([key, items]) => <section key={key} className="snippet-section">
      <h2>{groups.get(key)?.label} <span>{groups.get(key)?.items.length}</span></h2>
      <div className="snippet-grid" onKeyDown={arrowFocus}>{items.map((snippet) => <article className="surface snippet-card" key={snippet.id}>
        <div className="snippet-head"><span className="item-icon purple"><Terminal size={18} /></span><h3>{snippet.title}</h3>
          <button className="icon-button" aria-label={`Edit ${snippet.title}`} title="Edit snippet" onClick={() => onEdit(snippet)}><Pencil size={15} /></button>
          <button className="icon-button" aria-label={`Delete ${snippet.title}`} title="Delete snippet" onClick={() => onDelete(snippet)}><Trash2 size={15} /></button>
        </div>
        <pre><code>{snippet.content}</code></pre>
        <button data-list-entry className="button secondary" onClick={() => onCopy(snippet)} aria-label={`Copy ${snippet.title}`}><Clipboard size={15} /> Copy</button>
      </article>)}</div>
    </section>)}<Pager page={pagination.page} pages={pagination.pages} onChange={pagination.setPage} label="Snippet pages" /></>
      : <div className="surface"><Empty icon={Terminal} title="No snippets yet" text="Save a command or piece of reference text." action={<button className="text-button" onClick={onAdd}>Add snippet</button>} /></div>}
  </>;
}

export function NotesView({ workspace, noteId, onSelect, onAdd, onEdit, onDelete, onLink }: {
  workspace: Workspace; noteId: string | null; onSelect: (note: Note) => void;
  onAdd: () => void; onEdit: (note: Note) => void; onDelete: (note: Note) => void;
  onLink: (url: string) => void;
}) {
  const notes = useMemo(() => updatedFirst(workspace.notes), [workspace.notes]);
  const titles = useMemo(() => new Map(workspace.projects.map(({ id, title }) => [id, title])), [workspace.projects]);
  const activeIndex = noteId ? Math.max(0, notes.findIndex((note) => note.id === noteId)) : 0;
  const active = notes[activeIndex];
  const pagination = usePage(notes, 24, '', activeIndex);
  const metadata = (note: Note) => [
    titles.get(note.projectId), note.topic,
  ].filter(Boolean).join(' · ') || 'General note';

  return <>
    <div className="page-heading heading-action"><div><h1>Notes</h1><p>Capture debugging logs, decisions, and test results.</p></div><button className="button secondary" onClick={onAdd}><Plus size={16} /> Add note</button></div>
    {active ? <section className="surface notes-split">
      <div className="notes-list"><nav aria-label="Saved notes" onKeyDown={arrowFocus}>
        {pagination.items.map((note) => <button data-list-entry key={note.id} className={`note-row ${note.id === active.id ? 'chosen' : ''}`} onClick={() => onSelect(note)} aria-current={note.id === active.id ? 'true' : undefined}>
          <span className="item-icon neutral"><FileText size={17} /></span><span className="row-title"><strong>{note.title}</strong><span className="row-subtitle">{metadata(note)}</span></span>
        </button>)}
      </nav><Pager page={pagination.page} pages={pagination.pages} onChange={pagination.setPage} label="Note pages" /></div>
      <article className="note-document">
        <div className="note-document-head"><div><h2>{active.title}</h2><p>{metadata(active)} · {displayDate(active.updatedAt)}</p></div>
          <button className="icon-button" aria-label="Edit note" title="Edit note" onClick={() => onEdit(active)}><Pencil size={16} /></button>
          <button className="icon-button" aria-label="Delete note" title="Delete note" onClick={() => onDelete(active)}><Trash2 size={16} /></button>
        </div>
        <Suspense fallback={<div className="skeleton note-skeleton" role="status" aria-label="Loading note" />}>
          <NoteMarkdown content={active.content} onLink={onLink} />
        </Suspense>
      </article>
    </section> : <div className="surface"><Empty icon={FileText} title="No notes yet" text="Capture a finding, test result, or decision." action={<button className="text-button" onClick={onAdd}>Add note</button>} /></div>}
  </>;
}

const themeOptions = [{ value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon }, { value: 'system', label: 'System', icon: Laptop }] as const;

export function SettingsView({ theme, onTheme, onImport }: { theme: Theme; onTheme: (theme: Theme) => void; onImport: (file: File) => Promise<void> }) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  async function importFile(file: File) {
    setError('');
    setImporting(true);
    try { await onImport(file); }
    catch (error: unknown) {
      setError(error instanceof ImportError ? error.message : mutationMessage(error, 'Could not import this file. Your workspace was preserved.'));
    } finally { setImporting(false); }
  }
  return <>
    <div className="page-heading"><h1>Settings</h1><p>Manage your workspace appearance and local storage.</p></div>
    <section className="surface settings-card">
      <h2>Appearance</h2><p>Choose the color theme for NexaDesk.</p>
      <div className="theme-options" role="group" aria-label="Color theme">{themeOptions.map(({ value, label, icon: Icon }) =>
        <button key={value} className={`button secondary ${value === theme ? 'selected' : ''}`} aria-pressed={value === theme} onClick={() => onTheme(value)}><Icon size={17} />{label}</button>)}</div>
    </section>
    <section className="surface settings-card">
      <h2><HardDrive size={18} /> Local storage</h2>
      <p>{desktop ? 'Your workspace and migration backups are kept in the NexaDesk app data folder.' : 'This preview saves data in this browser.'}</p>
      <p className="storage-hint">Import projects, snippets, and notes from a NexaDesk JSON file. Existing entries are preserved.</p>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void importFile(file);
      }} />
      <button className="button secondary import-button" disabled={importing} onClick={() => fileInput.current?.click()}><Upload size={16} />{importing ? 'Importing…' : 'Import JSON'}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  </>;
}
