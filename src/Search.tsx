import { useState } from 'react';
import { ChevronRight, FileText, Folder, Search as SearchIcon, Terminal } from 'lucide-react';
import { Empty, Modal } from './components';
import { updatedFirst, type Workspace } from './model';
import type { EditorValue } from './Editor';

export function Search({ workspace, onClose, onSelect }: { workspace: Workspace; onClose: () => void; onSelect: (value: EditorValue) => void }) {
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(0);
  const items: EditorValue[] = [
    ...workspace.projects.map((item) => ({ kind: 'project' as const, item })),
    ...workspace.snippets.map((item) => ({ kind: 'snippet' as const, item })),
    ...workspace.notes.map((item) => ({ kind: 'note' as const, item })),
  ];
  const query = search.trim().toLowerCase();
  const words = query.split(/\s+/);
  const ranked = items.map((entry) => {
    const title = entry.item.title.toLowerCase();
    const details = entry.kind === 'project' ? [entry.item.description, entry.item.path, entry.item.status, ...entry.item.tags] :
      entry.kind === 'snippet' ? [entry.item.category, entry.item.content] :
        [entry.item.topic, entry.item.content, workspace.projects.find((project) => project.id === entry.item.projectId)?.title];
    const text = [title, ...details].join(' ').toLowerCase();
    if (words.some((word) => !text.includes(word))) return { entry, rank: -1, updatedAt: entry.item.updatedAt };
    // Titles take priority over matches in note text or linked project metadata.
    const rank = title === query ? 3 : title.startsWith(query) ? 2 : words.every((word) => title.includes(word)) ? 1 : 0;
    return { entry, rank, updatedAt: entry.item.updatedAt };
  });
  const results = updatedFirst(ranked.filter(({ rank }) => rank >= 0))
    .sort((a, b) => b.rank - a.rank)
    .map(({ entry }) => entry);
  const active = Math.min(focused, results.length - 1);
  const icons = { project: Folder, snippet: Terminal, note: FileText };

  return <Modal title="Search workspace" onClose={onClose} className="search-modal">
    <label className="filter-search palette-input"><SearchIcon size={18} />
      <input autoFocus aria-label="Search projects, snippets, and notes" placeholder="Search projects, snippets, and notes…" value={search}
        onChange={(event) => { setSearch(event.target.value); setFocused(0); }}
        onKeyDown={(event) => {
          if (!results.length) return;
          if (event.key === 'Enter') { event.preventDefault(); onSelect(results[active]); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const next = (active + (event.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length;
            setFocused(next);
            document.getElementById(`workspace-result-${next}`)?.scrollIntoView({ block: 'nearest' });
          }
        }} />
    </label>
    <div className="palette-results" aria-label="Search results">
      {results.length ? results.map((entry, index) => {
        const Icon = icons[entry.kind];
        return <button className={`palette-result ${index === active ? 'focused' : ''}`} id={`workspace-result-${index}`} key={`${entry.kind}-${entry.item.id}`} onClick={() => onSelect(entry)} onMouseMove={() => setFocused(index)}>
          <span className="item-icon neutral"><Icon size={16} /></span><strong>{entry.item.title}</strong><span className="result-kind">{entry.kind}</span><ChevronRight size={15} />
        </button>;
      }) : <Empty icon={SearchIcon} title="No results" text="Try a different title, tag, or keyword." />}
    </div>
  </Modal>;
}
