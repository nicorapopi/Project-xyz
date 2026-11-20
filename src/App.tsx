import { useEffect, useRef, useState } from 'react';
import { Header, Sidebar, Toast, ToastContext } from './components';
import { ConfirmDelete, Editor, NewItem, type EditorValue } from './Editor';
import { Overview } from './Overview';
import { Search } from './Search';
import { NotesView, ProjectDetails, ProjectsView, SettingsView, SnippetsView } from './Views';
import { WorkspaceBoundary, WorkspaceFailure, WorkspaceSkeleton } from './WorkspaceState';
import type { EditorState, Kind, Note, Project, Theme, View } from './model';
import { ImportError, MAX_IMPORT_BYTES, parseImport } from './schema';
import { copyText, openWebLink, revealFolder, StorageError } from './storage';
import { mutationMessage, useWorkspace } from './useWorkspace';
import { deleteEntry, importEntries, saveEntry } from './workspaceActions';

type Overlay =
  | { type: 'new' | 'search' }
  | { type: 'editor'; value: EditorState }
  | { type: 'project'; projectId: string }
  | { type: 'delete'; value: EditorValue };

const media = window.matchMedia('(prefers-color-scheme: dark)');
const compactViewport = window.matchMedia('(max-width: 840px)');

function focusMenu() {
  requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus());
}

export function App() {
  const { state, mutate, reload } = useWorkspace();
  const workspace = state.phase === 'ready' ? state.workspace : null;
  const ready = state.phase === 'ready';
  const [view, setView] = useState<View>('Overview');
  const [activeOnly, setActiveOnly] = useState(false);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState(media.matches);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const resize = (event: MediaQueryListEvent) => { if (!event.matches) setSidebarExpanded(false); };
    compactViewport.addEventListener('change', resize);
    return () => compactViewport.removeEventListener('change', resize);
  }, []);

  const dark = workspace?.theme === 'dark' || (workspace?.theme === 'system' && systemDark);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && ready && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOverlay((previous) => previous?.type === 'search' ? null : previous ?? { type: 'search' });
      }
      if (sidebarExpanded && event.key === 'Escape') {
        setSidebarExpanded(false);
        focusMenu();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ready, sidebarExpanded]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function notify(message: string, error = false) {
    window.clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = window.setTimeout(() => setToast(null), error ? 6500 : 3200);
  }

  function navigate(next: View, onlyActive = false) {
    if (sidebarExpanded) requestAnimationFrame(() => document.getElementById('main')?.focus());
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
    if (overlay?.type === 'editor' && overlay.value.item) {
      const original = overlay.value.item;
      const entries = value.kind === 'project' ? workspace?.projects : value.kind === 'snippet' ? workspace?.snippets : workspace?.notes;
      if (entries?.find(({ id }) => id === original.id)?.updatedAt !== original.updatedAt) throw new StorageError('conflict');
    }
    await mutate((data) => saveEntry(data, value));
    if (value.kind === 'project') { navigate('Projects'); openProject(value.item); }
    else if (value.kind === 'snippet') navigate('Snippets');
    else openNote(value.item);
    notify(`${value.kind[0].toUpperCase()}${value.kind.slice(1)} saved`);
  }

  async function deleteItem(value: EditorValue) {
    const id = value.item.id;
    const entries = value.kind === 'project' ? workspace?.projects : value.kind === 'snippet' ? workspace?.snippets : workspace?.notes;
    if (entries?.find((item) => item.id === id)?.updatedAt !== value.item.updatedAt) throw new StorageError('conflict');
    await mutate((data) => deleteEntry(data, value));
    if (value.kind === 'note' && noteId === id) setNoteId(null);
    setOverlay(null);
    notify('Item deleted');
  }

  function changeTheme(theme: Theme) {
    void mutate((data) => ({ ...data, theme })).catch((error: unknown) =>
      notify(mutationMessage(error, 'Could not save the theme. Your previous theme was restored.'), true));
  }

  async function importFile(file: File) {
    if (file.size > MAX_IMPORT_BYTES) throw new ImportError('Choose a JSON file smaller than 16 MB.');
    const data = parseImport(await file.text());
    await mutate(importEntries(data));
    notify('Workspace items imported');
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
    <a className="skip-link" href="#main">Skip to workspace</a>
    <Sidebar view={view} go={navigate} workspace={workspace} expanded={sidebarExpanded} saving={state.phase === 'ready' && state.pending > 0} />
    {sidebarExpanded && <button aria-label="Close navigation" tabIndex={-1} className="sidebar-backdrop" onClick={() => {
      setSidebarExpanded(false);
      focusMenu();
    }} />}
    <div className="app-body">
      <Header view={view} dark={dark} onTheme={() => workspace && changeTheme(dark ? 'light' : 'dark')}
        onSearch={() => workspace && setOverlay({ type: 'search' })} onNew={() => workspace && setOverlay({ type: 'new' })}
        ready={ready} sidebarExpanded={sidebarExpanded} onMenu={() => setSidebarExpanded(!sidebarExpanded)} />
      <main className="main-scroll" id="main" tabIndex={-1}>
        <div className="page" key={view}>
          <WorkspaceBoundary onRetry={() => { setOverlay(null); }}>
          {workspace ? <>
            {view === 'Overview' && <Overview workspace={workspace} onProjects={() => navigate('Projects')} onActiveProjects={() => navigate('Projects', true)}
              onSnippets={() => navigate('Snippets')} onNotes={() => navigate('Notes')} onAdd={() => addItem('project')} onProject={openProject} onNote={openNote} />}
            {view === 'Projects' && <ProjectsView key={String(activeOnly)} projects={workspace.projects} activeOnly={activeOnly} onAdd={() => addItem('project')} onOpen={openProject} />}
            {view === 'Snippets' && <SnippetsView snippets={workspace.snippets} onAdd={() => addItem('snippet')}
              onEdit={(item) => editItem({ kind: 'snippet', item })} onDelete={(item) => askDelete({ kind: 'snippet', item })}
              onCopy={(item) => void copy(item.content, 'Snippet copied')}/>}
            {view === 'Notes' && <NotesView workspace={workspace} noteId={noteId} onSelect={(note) => setNoteId(note.id)} onAdd={() => addItem('note')}
              onLink={(url) => void openWebLink(url).catch(() => notify('Could not open this link', true))}
              onEdit={(item) => editItem({ kind: 'note', item })} onDelete={(item) => askDelete({ kind: 'note', item })} />}
            {view === 'Settings' && <SettingsView theme={workspace.theme} onTheme={changeTheme} onImport={importFile} />}
          </> : state.phase === 'failure' ? <WorkspaceFailure message={state.message} onRetry={() => void reload()} /> : <WorkspaceSkeleton />}
          </WorkspaceBoundary>
        </div>
      </main>
    </div>
    {workspace && overlay?.type === 'new' && <NewItem onChoose={addItem} onClose={close} />}
    {workspace && overlay?.type === 'search' && <Search workspace={workspace} onClose={close} onSelect={selectSearch} onNavigate={navigate} onCreate={addItem} />}
    {workspace && overlay?.type === 'editor' && <Editor state={overlay.value} projects={workspace.projects} onClose={close} onSave={saveItem} />}
    {overlay?.type === 'delete' && <ConfirmDelete value={overlay.value} onClose={close} onDelete={() => deleteItem(overlay.value)} />}
    {workspace && inspected && <ProjectDetails project={inspected} notes={workspace.notes.filter((note) => note.projectId === inspected.id)}
      onClose={close} onEdit={() => editItem({ kind: 'project', item: inspected })} onDelete={() => askDelete({ kind: 'project', item: inspected })}
      onCopy={() => void copy(inspected.path, 'Folder path copied')} onNote={openNote}
      onReveal={() => void revealFolder(inspected.id).catch(() => notify('Choose an existing absolute local folder in Edit Project.', true))} />}
    {toast && !overlay && <Toast {...toast} />}
  </div></ToastContext.Provider>;
}
