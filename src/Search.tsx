import { useDeferredValue, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, FileText, Folder, Plus, Search as SearchIcon, Terminal, type LucideIcon } from 'lucide-react';
import { Empty, Modal, navigation } from './components';
import { updatedFirst, type Kind, type View, type Workspace } from './model';
import type { EditorValue } from './Editor';

type Choice =
  | { type: 'entry'; key: string; title: string; label: string; icon: LucideIcon; entry: EditorValue }
  | { type: 'create'; key: string; title: string; label: string; icon: LucideIcon; kind: Kind }
  | { type: 'navigate'; key: string; title: string; label: string; icon: LucideIcon; view: View };

const icons = { project: Folder, snippet: Terminal, note: FileText };
const actions: Choice[] = [
  ...(['project', 'snippet', 'note'] as const).map((kind) => ({
    type: 'create' as const, key: 'new-' + kind, title: 'New ' + kind, label: 'Create', icon: Plus, kind,
  })),
  ...navigation.map(({ label, icon }) => ({
    type: 'navigate' as const, key: label, title: 'Go to ' + label, label: 'Navigate', icon, view: label,
  })),
];

function indexWorkspace(projects: Workspace['projects'], snippets: Workspace['snippets'], notes: Workspace['notes']) {
  const titles = new Map(projects.map(({ id, title }) => [id, title]));
  const entries: EditorValue[] = [
    ...projects.map((item) => ({ kind: 'project' as const, item })),
    ...snippets.map((item) => ({ kind: 'snippet' as const, item })),
    ...notes.map((item) => ({ kind: 'note' as const, item })),
  ];
  return updatedFirst(entries.map((entry) => {
    const detail = entry.kind === 'project' ? [entry.item.description, entry.item.path, entry.item.status, ...entry.item.tags] :
      entry.kind === 'snippet' ? [entry.item.category, entry.item.content] :
        [entry.item.topic, titles.get(entry.item.projectId), entry.item.content];
    const title = entry.item.title.toLowerCase();
    const choice: Choice = {
      type: 'entry', key: [entry.kind, entry.item.id].join('-'), title: entry.item.title,
      label: entry.kind, icon: icons[entry.kind], entry,
    };
    return { updatedAt: entry.item.updatedAt, choice, title, detail: detail.join(' ').toLowerCase() };
  }));
}

const RESULT_LIMIT = 36;

function match(index: ReturnType<typeof indexWorkspace>, query: string) {
  if (!query) return { choices: [...actions.slice(0, 3), ...index.slice(0, 7).map(({ choice }) => choice), ...actions.slice(3)], total: Math.min(15, index.length + actions.length) };
  const words = query.split(/\s+/);
  const ranks: Choice[][] = [[], [], [], []];
  let total = 0;
  for (const { title, detail, choice } of index) {
    if (!words.every((word) => title.includes(word) || detail.includes(word))) continue;
    const rank = title === query ? 0 : title.startsWith(query) ? 1 : words.every((word) => title.includes(word)) ? 2 : 3;
    if (ranks[rank].length < RESULT_LIMIT) ranks[rank].push(choice);
    total++;
  }
  const matchingActions = actions.filter(({ title }) => words.every((word) => title.toLowerCase().includes(word)));
  return { choices: [...ranks.flat(), ...matchingActions].slice(0, RESULT_LIMIT), total: total + matchingActions.length };
}

export function Search({ workspace, onClose, onSelect, onNavigate, onCreate }: {
  workspace: Workspace; onClose: () => void; onSelect: (value: EditorValue) => void; onNavigate: (view: View) => void; onCreate: (kind: Kind) => void;
}) {
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(0);
  const resultsId = useId();
  const { projects, snippets, notes } = workspace;
  const index = useMemo(() => indexWorkspace(projects, snippets, notes), [projects, snippets, notes]);
  const query = search.trim().toLowerCase();
  const deferred = useDeferredValue(query);
  const { choices, total } = useMemo(() => match(index, deferred), [index, deferred]);
  const active = Math.min(focused, choices.length - 1);
  const optionId = (position: number) => [resultsId, position].join('-');

  function choose(choice: Choice) {
    if (choice.type === 'entry') onSelect(choice.entry);
    else if (choice.type === 'navigate') onNavigate(choice.view);
    else onCreate(choice.kind);
  }

  function handleKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Enter') {
      const next = query === deferred ? choices[active] : match(index, query).choices[0];
      if (next) { event.preventDefault(); choose(next); }
    }
    if (query !== deferred || !choices.length || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    event.preventDefault();
    const next = (active + (event.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length;
    setFocused(next);
    document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' });
  }

  return <Modal title="Search workspace" onClose={onClose} className="search-modal">
    <label className="filter-search palette-input"><SearchIcon size={18} />
      <input autoFocus role="combobox" aria-autocomplete="list" aria-expanded aria-controls={resultsId}
        aria-activedescendant={active >= 0 ? optionId(active) : undefined} aria-label="Search projects, snippets, notes, and actions"
        placeholder="Search or jump to…" value={search} maxLength={240}
        onChange={(event) => { setSearch(event.target.value); setFocused(0); }}
        onKeyDown={handleKeys} />
    </label>
    <div className="palette-results" role="listbox" id={resultsId} aria-label="Search results" aria-busy={deferred !== query}>
      {choices.map((choice, position) => <div role="option" aria-selected={active === position}
        className={active === position ? 'palette-result focused' : 'palette-result'} id={optionId(position)} key={choice.key}
        onMouseDown={(event) => event.preventDefault()} onClick={() => choose(choice)} onMouseMove={() => setFocused(position)}>
        <span className="item-icon neutral"><choice.icon size={16} /></span><strong>{choice.title}</strong><span className="result-kind">{choice.label}</span><ChevronRight size={15} />
      </div>)}
    </div>
    {!choices.length && deferred === query && <Empty icon={SearchIcon} title="No matches" text="Try a title, a tech tag, or a command."
      action={<button className="text-button" onClick={() => {
        setSearch(''); setFocused(0);
        document.getElementById(resultsId)?.previousElementSibling?.querySelector('input')?.focus();
      }}>Clear search</button>} />}
    <footer className="palette-footer">
      <span><kbd><ArrowUp size={11} /></kbd><kbd><ArrowDown size={11} /></kbd> Move <kbd>↵</kbd> Open</span>
      {total > RESULT_LIMIT ? <span>{RESULT_LIMIT} of {total} matches</span> : <span><kbd>Esc</kbd> Close</span>}
    </footer>
  </Modal>;
}
