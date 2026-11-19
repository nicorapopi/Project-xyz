import { useState } from 'react';
import { ChevronRight, Clipboard, FileText, Folder, FolderOpen, HardDrive, Laptop, Moon, Pencil, Plus, Search, Sun, Terminal, Trash2 } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CopyButton, Empty, Modal, ProjectIcon, SelectField, StatusBadge, Tags } from './components';
import { displayDate, statuses, updatedFirst, type Note, type Project, type Snippet, type Theme, type Workspace } from './model';
import { desktop } from './storage';

export function ProjectsView({ projects, onAdd, onOpen, activeOnly }: {
  projects: Project[]; onAdd: () => void; onOpen: (project: Project) => void; activeOnly: boolean;
}) {
  const [status, setStatus] = useState(activeOnly ? 'Active' : '');
  const [tag, setTag] = useState('');
  const [query, setQuery] = useState('');
  const tags = [...new Set(projects.flatMap((project) => project.tags.map((tag) => tag.toLowerCase())))].sort();
  const filtered = updatedFirst(projects).filter((project) => {
    const matchesStatus = status === 'Active' ? project.status === 'In Progress' || project.status === 'Testing' : !status || project.status === status;
    return matchesStatus && (!tag || project.tags.some((item) => item.toLowerCase() === tag)) &&
      [project.title, project.description, project.path, ...project.tags].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  });

  return <>
    <div className="page-heading heading-action"><div><h1>Projects</h1><p>Track your repositories, tech stacks, and progress.</p></div><button className="button secondary" onClick={onAdd}><Plus size={16} /> Add project</button></div>
    <div className="filters">
      <label className="filter-search"><Search size={16} /><input aria-label="Filter projects" placeholder="Filter projects…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <SelectField label="Filter by status" value={status} onChange={setStatus} options={[{ value: '', label: 'All statuses' }, { value: 'Active', label: 'Active' }, ...statuses.map((status) => ({ value: status, label: status }))]} />
      <SelectField label="Filter by tag" value={tag} onChange={setTag} options={[{ value: '', label: 'All tags' }, ...tags.map((tag) => ({ value: tag, label: projects.flatMap((project) => project.tags).find((item) => item.toLowerCase() === tag) ?? tag }))]} />
    </div>
    {filtered.length ? <section className="project-grid" aria-label="Projects">
      {filtered.map((project) => <button className="surface project-card" key={project.id} onClick={() => onOpen(project)}>
        <div className="project-card-top"><ProjectIcon id={project.id} /><StatusBadge status={project.status} /></div>
        <h2>{project.title}</h2><p>{project.description || 'No quick notes'}</p><Tags tags={project.tags} />
        <div className="project-card-foot"><Folder size={15} /><span>{project.path || 'No local folder'}</span><ChevronRight size={16} /></div>
      </button>)}
    </section> : <div className="surface"><Empty title={projects.length ? 'No matching projects' : 'No projects yet'}
      text={projects.length ? 'Try adjusting your filters.' : 'Add a project to track its status and local folder.'}
      action={projects.length ? <button className="text-button" onClick={() => { setStatus(''); setTag(''); setQuery(''); }}>Clear filters</button> : <button className="text-button" onClick={onAdd}>Add project</button>} /></div>}
  </>;
}

export function ProjectDetails({ project, notes, onClose, onEdit, onDelete, onCopy, onReveal, onNote }: {
  project: Project; notes: Note[]; onClose: () => void; onEdit: () => void; onDelete: () => void;
  onCopy: () => void; onReveal: () => void; onNote: (note: Note) => void;
}) {
  return <Modal title={project.title} onClose={onClose}>
    <div className="project-inspect">
      <div className="project-inspect-head"><ProjectIcon id={project.id} /><StatusBadge status={project.status} /><span>Updated {displayDate(project.updatedAt)}</span></div>
      <Tags tags={project.tags} />
      {project.description && <section><h3>Quick notes</h3><p>{project.description}</p></section>}
      <section><h3>Local folder</h3>
        {project.path ? <div className="path-box"><Folder size={16} /><code>{project.path}</code><CopyButton label="Copy folder path" onClick={onCopy} />
          {desktop && <button className="icon-button" onClick={onReveal} aria-label="Show folder in file manager" title="Show folder in file manager"><FolderOpen size={16} /></button>}</div> : <p>No local folder has been set.</p>}
      </section>
      {notes.length > 0 && <section><h3>Linked notes</h3>{notes.map((note) => <button className="linked-note" key={note.id} onClick={() => onNote(note)}><FileText size={15} />{note.title}<ChevronRight size={15} /></button>)}</section>}
    </div>
    <div className="modal-actions spread"><button className="button delete-button" onClick={onDelete}><Trash2 size={16} /> Delete</button><button className="button primary" onClick={onEdit}><Pencil size={15} /> Edit project</button></div>
  </Modal>;
}

export function SnippetsView({ snippets, onAdd, onEdit, onDelete, onCopy }: {
  snippets: Snippet[]; onAdd: () => void; onEdit: (snippet: Snippet) => void;
  onDelete: (snippet: Snippet) => void; onCopy: (snippet: Snippet) => void;
}) {
  const groups = new Map<string, { label: string; items: Snippet[] }>();
  for (const snippet of updatedFirst(snippets)) {
    const key = snippet.category.toLowerCase();
    const group = groups.get(key) ?? { label: snippet.category, items: [] };
    group.items.push(snippet);
    groups.set(key, group);
  }
  const categories = [...groups].sort(([, a], [, b]) => a.label.localeCompare(b.label));
  const [category, setCategory] = useState('');
  const selected = groups.has(category) ? category : '';
  return <>
    <div className="page-heading heading-action"><div><h1>Snippets</h1><p>Keep frequently used commands and reference text in one place.</p></div><button className="button secondary" onClick={onAdd}><Plus size={16} /> Add snippet</button></div>
    <div className="filters"><SelectField label="Filter by category" value={selected} onChange={setCategory}
      options={[{ value: '', label: 'All categories' }, ...categories.map(([key, group]) => ({ value: key, label: group.label }))]} /></div>
    {categories.length ? categories.filter(([key]) => !selected || key === selected).map(([key, group]) => <section key={key} className="snippet-section">
      <h2>{group.label} <span>{group.items.length}</span></h2>
      <div className="snippet-grid">{group.items.map((snippet) => <article className="surface snippet-card" key={snippet.id}>
        <div className="snippet-head"><span className="item-icon purple"><Terminal size={18} /></span><h3>{snippet.title}</h3>
          <button className="icon-button" aria-label={`Edit ${snippet.title}`} title="Edit snippet" onClick={() => onEdit(snippet)}><Pencil size={15} /></button>
          <button className="icon-button" aria-label={`Delete ${snippet.title}`} title="Delete snippet" onClick={() => onDelete(snippet)}><Trash2 size={15} /></button>
        </div>
        <pre><code>{snippet.content}</code></pre>
        <button className="button secondary" onClick={() => onCopy(snippet)} aria-label={`Copy ${snippet.title}`}><Clipboard size={15} /> Copy</button>
      </article>)}</div>
    </section>) : <div className="surface"><Empty icon={Terminal} title="No snippets yet" text="Save a command or piece of reference text." action={<button className="text-button" onClick={onAdd}>Add snippet</button>} /></div>}
  </>;
}

export function NotesView({ workspace, noteId, onSelect, onAdd, onEdit, onDelete }: {
  workspace: Workspace; noteId: string | null; onSelect: (note: Note) => void;
  onAdd: () => void; onEdit: (note: Note) => void; onDelete: (note: Note) => void;
}) {
  const notes = updatedFirst(workspace.notes);
  const active = notes.find((note) => note.id === noteId) ?? notes[0];
  const metadata = (note: Note) => [
    workspace.projects.find((project) => project.id === note.projectId)?.title, note.topic,
  ].filter(Boolean).join(' · ') || 'General note';

  return <>
    <div className="page-heading heading-action"><div><h1>Notes</h1><p>Capture debugging logs, decisions, and test results.</p></div><button className="button secondary" onClick={onAdd}><Plus size={16} /> Add note</button></div>
    {active ? <section className="surface notes-split">
      <nav className="notes-list" aria-label="Saved notes">
        {notes.map((note) => <button key={note.id} className={`note-row ${note.id === active.id ? 'chosen' : ''}`} onClick={() => onSelect(note)} aria-current={note.id === active.id ? 'true' : undefined}>
          <span className="item-icon neutral"><FileText size={17} /></span><span className="row-title"><strong>{note.title}</strong><span className="row-subtitle">{metadata(note)}</span></span>
        </button>)}
      </nav>
      <article className="note-document">
        <div className="note-document-head"><div><h2>{active.title}</h2><p>{metadata(active)} · {displayDate(active.updatedAt)}</p></div>
          <button className="icon-button" aria-label="Edit note" title="Edit note" onClick={() => onEdit(active)}><Pencil size={16} /></button>
          <button className="icon-button" aria-label="Delete note" title="Delete note" onClick={() => onDelete(active)}><Trash2 size={16} /></button>
        </div>
        <div className="markdown"><Markdown remarkPlugins={[remarkGfm]} components={{
          img: ({ alt }) => <span>{alt}</span>,
          a: ({ href, children }) => {
            if (!href || !/^https?:\/\//i.test(href)) return <span>{children}</span>;
            return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
          },
        }}>{active.content}</Markdown></div>
      </article>
    </section> : <div className="surface"><Empty icon={FileText} title="No notes yet" text="Capture a finding, test result, or decision." action={<button className="text-button" onClick={onAdd}>Add note</button>} /></div>}
  </>;
}

const themeOptions = [{ value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon }, { value: 'system', label: 'System', icon: Laptop }] as const;

export function SettingsView({ theme, onTheme }: { theme: Theme; onTheme: (theme: Theme) => void }) {
  return <>
    <div className="page-heading"><h1>Settings</h1><p>Manage your workspace appearance and local storage.</p></div>
    <section className="surface settings-card">
      <h2>Appearance</h2><p>Choose the color theme for NexaDesk.</p>
      <div className="theme-options" role="group" aria-label="Color theme">{themeOptions.map(({ value, label, icon: Icon }) =>
        <button key={value} className={`button secondary ${value === theme ? 'selected' : ''}`} aria-pressed={value === theme} onClick={() => onTheme(value)}><Icon size={17} />{label}</button>)}</div>
    </section>
    <section className="surface settings-card">
      <h2><HardDrive size={18} /> Local storage</h2>
      <p>{desktop ? 'Your workspace is saved in workspace.json in the NexaDesk app data folder.' : 'This preview saves your workspace to local storage in this browser.'}</p>
    </section>
  </>;
}
