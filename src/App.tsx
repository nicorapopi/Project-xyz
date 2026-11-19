import { useEffect, useRef, useState } from 'react';
import { Header, Sidebar, Toast, ToastContext } from './components';
import { ConfirmDelete, Editor, NewItem, type EditorValue } from './Editor';
import { Overview } from './Overview';
import { Search } from './Search';
import { NotesView, ProjectDetails, ProjectsView, SettingsView, SnippetsView } from './Views';
import type { EditorState, Kind, Note, Project, Theme, View, Workspace } from './model';
import { copyText, readWorkspace, revealFolder, saveWorkspace } from './storage';

type Overlay =
  | { type: 'new' | 'search' }
  | { type: 'editor'; value: EditorState }
  | { type: 'project'; projectId: string }
  | { type: 'delete'; value: EditorValue };

function replaceItem<T extends { id: string }>(items: T[], item: T) {
  return items.some((entry) => entry.id === item.id) ? items.map((entry) => entry.id === item.id ? item : entry) : [item, ...items];
}

const media = window.matchMedia('(prefers-color-scheme: dark)');

export function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [view, setView] = useState<View>('Overview');
  const [activeOnly, setActiveOnly] = useState(false);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState(media.matches);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const currentWorkspace = useRef<Workspace | null>(null);
  const mutations = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let canceled = false;
    void readWorkspace().then((data) => {
      if (!canceled) { currentWorkspace.current = data; setWorkspace(data); setLoadError(false); }
    }).catch(() => { if (!canceled) setLoadError(true); });
    return () => { canceled = true; };
  }, [loadAttempt]);

  useEffect(() => {
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const dark = workspace?.theme === 'dark' || (workspace?.theme === 'system' && systemDark);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && currentWorkspace.current) {
        event.preventDefault();
        setOverlay((previous) => previous?.type === 'search' ? null : previous ?? { type: 'search' });
      }
      if (event.key === 'Escape') setSidebarExpanded(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); window.clearTimeout(toastTimer.current); };
  }, []);

  function notify(message: string, error = false) {
    window.clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = window.setTimeout(() => setToast(null), 2900);
  }

  function updateWorkspace(update: (data: Workspace) => Workspace) {
    // Derive each write from the latest successful save, even when changes overlap.
    const operation = mutations.current.catch(() => undefined).then(async () => {
      if (!currentWorkspace.current) throw new Error('Workspace is unavailable.');
      const next = update(currentWorkspace.current);
      await saveWorkspace(next);
      currentWorkspace.current = next;
      setWorkspace(next);
    });
    mutations.current = operation;
    return operation;
  }

  function navigate(next: View, onlyActive = false) {
    setActiveOnly(onlyActive);
    setView(next);
    setSidebarExpanded(false);
    setOverlay(null);
  }

  function openNote(note: Note) { setNoteId(note.id); navigate('Notes'); }
  function openProject(project: Project) { setOverlay({ type: 'project', projectId: project.id }); }
  function addItem(kind: Kind) { setOverlay({ type: 'editor', value: { kind } }); }
  function editItem(value: EditorValue) { setOverlay({ type: 'editor', value }); }
  function askDelete(value: EditorValue) { setOverlay({ type: 'delete', value }); }

  async function saveItem(value: EditorValue) {
    await updateWorkspace((data) => {
      if (value.kind === 'project') return { ...data, projects: replaceItem(data.projects, value.item) };
      if (value.kind === 'snippet') return { ...data, snippets: replaceItem(data.snippets, value.item) };
      return { ...data, notes: replaceItem(data.notes, value.item) };
    });
    if (value.kind === 'project') { navigate('Projects'); openProject(value.item); }
    else if (value.kind === 'snippet') navigate('Snippets');
    else openNote(value.item);
    notify(`${value.kind[0].toUpperCase()}${value.kind.slice(1)} saved`);
  }

  async function deleteItem(value: EditorValue) {
    const id = value.item.id;
    await updateWorkspace((data) => {
      if (value.kind === 'project') return {
        ...data,
        projects: data.projects.filter((project) => project.id !== id),
        notes: data.notes.map((note) => note.projectId === id ? { ...note, projectId: '' } : note),
      };
      if (value.kind === 'snippet') return { ...data, snippets: data.snippets.filter((snippet) => snippet.id !== id) };
      return { ...data, notes: data.notes.filter((note) => note.id !== id) };
    });
    if (value.kind === 'note' && noteId === id) setNoteId(null);
    setOverlay(null);
    notify('Item deleted');
  }

  function changeTheme(theme: Theme) {
    void updateWorkspace((data) => ({ ...data, theme })).catch(() => notify('Could not save the theme', true));
  }

  async function copy(value: string, message: string) {
    try { await copyText(value); notify(message); }
    catch { notify('Could not access the clipboard', true); }
  }

  function selectSearch(value: EditorValue) {
    if (value.kind === 'project') { navigate('Projects'); openProject(value.item); }
    else if (value.kind === 'snippet') { navigate('Snippets'); editItem(value); }
    else openNote(value.item);
  }

  const inspected = overlay?.type === 'project' ? workspace?.projects.find((project) => project.id === overlay.projectId) : undefined;
  const close = () => setOverlay(null);

  return <ToastContext.Provider value={toast}><div className="app-shell">
    <Sidebar view={view} go={navigate} workspace={workspace} expanded={sidebarExpanded} />
    {sidebarExpanded && <button aria-label="Close navigation" className="sidebar-backdrop" onClick={() => setSidebarExpanded(false)} />}
    <div className="app-body">
      <Header view={view} dark={dark} onTheme={() => workspace && changeTheme(dark ? 'light' : 'dark')}
        onSearch={() => workspace && setOverlay({ type: 'search' })} onNew={() => workspace && setOverlay({ type: 'new' })}
        sidebarExpanded={sidebarExpanded} onMenu={() => setSidebarExpanded(!sidebarExpanded)} />
      <main className="main-scroll" id="main">
        <div className="page" key={view}>
          {workspace ? <>
            {view === 'Overview' && <Overview workspace={workspace} onProjects={() => navigate('Projects')} onActiveProjects={() => navigate('Projects', true)}
              onSnippets={() => navigate('Snippets')} onNotes={() => navigate('Notes')} onAdd={() => addItem('project')} onProject={openProject} onNote={openNote} />}
            {view === 'Projects' && <ProjectsView key={String(activeOnly)} projects={workspace.projects} activeOnly={activeOnly} onAdd={() => addItem('project')} onOpen={openProject} />}
            {view === 'Snippets' && <SnippetsView snippets={workspace.snippets} onAdd={() => addItem('snippet')}
              onEdit={(item) => editItem({ kind: 'snippet', item })} onDelete={(item) => askDelete({ kind: 'snippet', item })}
              onCopy={(item) => void copy(item.content, 'Snippet copied')}/>}
            {view === 'Notes' && <NotesView workspace={workspace} noteId={noteId} onSelect={(note) => setNoteId(note.id)} onAdd={() => addItem('note')}
              onEdit={(item) => editItem({ kind: 'note', item })} onDelete={(item) => askDelete({ kind: 'note', item })} />}
            {view === 'Settings' && <SettingsView theme={workspace.theme} onTheme={changeTheme} />}
          </> : <div className="page-heading"><h1>NexaDesk</h1>{loadError
            ? <><p role="alert">Could not load your saved workspace.</p><button className="button secondary load-retry" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</button></>
            : <p role="status">Loading workspace…</p>}</div>}
        </div>
      </main>
    </div>
    {workspace && overlay?.type === 'new' && <NewItem onChoose={addItem} onClose={close} />}
    {workspace && overlay?.type === 'search' && <Search workspace={workspace} onClose={close} onSelect={selectSearch} />}
    {workspace && overlay?.type === 'editor' && <Editor state={overlay.value} projects={workspace.projects} onClose={close} onSave={saveItem} />}
    {overlay?.type === 'delete' && <ConfirmDelete value={overlay.value} onClose={close} onDelete={() => deleteItem(overlay.value)} />}
    {workspace && inspected && <ProjectDetails project={inspected} notes={workspace.notes.filter((note) => note.projectId === inspected.id)}
      onClose={close} onEdit={() => editItem({ kind: 'project', item: inspected })} onDelete={() => askDelete({ kind: 'project', item: inspected })}
      onCopy={() => void copy(inspected.path, 'Folder path copied')} onNote={openNote}
      onReveal={() => void revealFolder(inspected.path).catch(() => notify('Could not find or reveal this folder', true))} />}
    {toast && !overlay && <Toast {...toast} />}
  </div></ToastContext.Provider>;
}
