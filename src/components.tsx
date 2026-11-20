import { createContext, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ArrowRight, AudioLines, Boxes, Braces, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CodeXml, Command, Copy, FileText, Folder, FolderOpen, Layers3, LayoutGrid, Menu, Moon, Plus, Search, Settings2, Sun, Terminal, X, type LucideIcon } from 'lucide-react';
import { statusClass, type Status, type View, type Workspace } from './model';
import { arrowFocus } from './useList';

export const navigation: { label: View; icon: LucideIcon }[] = [
  { label: 'Overview', icon: LayoutGrid },
  { label: 'Projects', icon: Folder },
  { label: 'Snippets', icon: Terminal },
  { label: 'Notes', icon: FileText },
  { label: 'Settings', icon: Settings2 },
];

export function Sidebar({ view, go, workspace, expanded, saving }: {
  view: View; go: (view: View) => void; workspace: Workspace | null; expanded: boolean; saving: boolean;
}) {
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (expanded) navRef.current?.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus({ preventScroll: true });
  }, [expanded]);
  const counts = { Projects: workspace?.projects.length, Snippets: workspace?.snippets.length, Notes: workspace?.notes.length };
  return <aside className={`sidebar ${expanded ? 'expanded' : ''}`} id="workspace-sidebar">
    <div className="brand"><span className="brand-mark"><Layers3 size={20} strokeWidth={2.15} /></span>
      <div><strong>NexaDesk</strong><span>Developer workspace</span></div>
    </div>
    <div className="nav-label">WORKSPACE</div>
    <nav aria-label="Workspace" ref={navRef} onKeyDown={(event) => {
      if (expanded && event.key === 'Tab') {
        const links = event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-list-entry]');
        const first = links[0];
        const last = links[links.length - 1];
        if (event.shiftKey ? event.target === first : event.target === last) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      } else arrowFocus(event);
    }}>
      {navigation.map(({ label, icon: Icon }) => (
        <button data-list-entry key={label} type="button" className={`nav-item ${view === label ? 'active' : ''}`} aria-current={view === label ? 'page' : undefined} onClick={() => go(label)}>
          <Icon size={17} /><span>{label}</span>{label in counts && <small>{counts[label as keyof typeof counts]}</small>}
        </button>
      ))}
    </nav>
    <div className="sidebar-footer">
      <span className="local-mark"><Command size={17} /></span>
      <div><strong>Personal workspace</strong><span className={saving ? 'storage-saving' : undefined}><i /> {saving ? 'Saving locally…' : 'Local workspace'}</span></div>
    </div>
  </aside>;
}

export function Header({ view, dark, onTheme, onSearch, onNew, ready, sidebarExpanded, onMenu }: {
  view: View; dark: boolean; onTheme: () => void; onSearch: () => void; onNew: () => void;
  ready: boolean; sidebarExpanded: boolean; onMenu: () => void;
}) {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const ViewIcon = navigation.find(({ label }) => label === view)?.icon ?? LayoutGrid;
  return <header className="topbar">
    <div className="topbar-location">
      <button className="icon-button mobile-menu" aria-label="Toggle navigation" aria-expanded={sidebarExpanded} aria-controls="workspace-sidebar" onClick={onMenu}><Menu size={19} /></button>
      <ViewIcon size={17} /><span>{view}</span>
    </div>
    <div className="topbar-actions">
      <button className="search-trigger" disabled={!ready} aria-label="Search workspace" aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'} onClick={onSearch}><Search size={16} /><span>Find anything…</span><kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd></button>
      <button className="icon-button theme-button" disabled={!ready} onClick={onTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
      <button className="button primary" disabled={!ready} onClick={onNew}><Plus size={17} /><span>New Item</span></button>
    </div>
  </header>;
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`status ${statusClass[status]}`}><i />{status}</span>;
}

export function Tags({ tags }: { tags: string[] }) {
  return <div className="tags">{[...new Set(tags)].map((tag) => <span key={tag}>{tag}</span>)}</div>;
}

const projectIcons = [Braces, AudioLines, CodeXml, Boxes];
const projectColors = ['blue', 'amber', 'green', 'purple'];

export function ProjectIcon({ id }: { id: string }) {
  const sampleIndex = ['orbit', 'sensor', 'studio', 'pipeline'].indexOf(id);
  const index = sampleIndex >= 0 ? sampleIndex : (id.charCodeAt(0) || 0) % projectIcons.length;
  const Icon = projectIcons[index];
  return <span className={`item-icon ${projectColors[index]}`}><Icon size={19} strokeWidth={1.8} /></span>;
}

export function Empty({ icon: Icon = FolderOpen, title, text, action }: {
  icon?: LucideIcon; title: string; text: string; action?: ReactNode;
}) {
  return <div className="empty"><span className="item-icon neutral"><Icon size={21} /></span><strong>{title}</strong><p>{text}</p>{action}</div>;
}

export function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[];
}) {
  return <div className="select-wrap"><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select><ChevronDown size={14} /></div>;
}

export function PanelHeader({ title, icon: Icon, onView }: { title: string; icon: LucideIcon; onView: () => void }) {
  return <div className="panel-heading"><h2><Icon size={18} />{title}</h2><button className="text-button" onClick={onView}>View all <ArrowRight size={14} /></button></div>;
}

export const ToastContext = createContext<{ message: string; error: boolean } | null>(null);

export function Modal({ title, children, onClose, className = '' }: {
  title: string; children: ReactNode; onClose: () => void; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const toast = useContext(ToastContext);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);

  return <dialog ref={ref} aria-label={title} className={`modal ${className}`}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-inner">
      <div className="modal-header"><h2>{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div>
      {children}
      {toast && <Toast {...toast} />}
    </div>
  </dialog>;
}

export function Toast({ message, error }: { message: string; error: boolean }) {
  return <div className={`toast ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'} aria-atomic="true">
    <span className="toast-icon">{error ? <CircleAlert size={16} /> : <Check size={16} />}</span>{message}
  </div>;
}

export function Pager({ page, pages, onChange, label }: { page: number; pages: number; onChange: (page: number) => void; label: string }) {
  if (pages < 2) return null;
  return <nav className="pager" aria-label={label}>
    <button className="icon-button" type="button" aria-label="Previous page" disabled={page === 0} onClick={() => onChange(page - 1)}><ChevronLeft size={16} /></button>
    <span aria-live="polite">Page {page + 1} of {pages}</span>
    <button className="icon-button" type="button" aria-label="Next page" disabled={page + 1 === pages} onClick={() => onChange(page + 1)}><ChevronRight size={16} /></button>
  </nav>;
}

export function CopyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="icon-button copy-button" type="button" aria-label={label} title={label} onClick={onClick}><Copy size={15} /></button>;
}
