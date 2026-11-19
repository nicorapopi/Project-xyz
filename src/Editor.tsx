import { useState, type FormEvent } from 'react';
import { FileText, Folder, Terminal, Trash2 } from 'lucide-react';
import { Modal } from './components';
import { statuses, type EditorState, type Kind, type Note, type Project, type Snippet, type Status } from './model';

export type EditorValue =
  | { kind: 'project'; item: Project }
  | { kind: 'snippet'; item: Snippet }
  | { kind: 'note'; item: Note };

const kindIcons = [
  { kind: 'project', label: 'Project', icon: Folder },
  { kind: 'snippet', label: 'Snippet', icon: Terminal },
  { kind: 'note', label: 'Note', icon: FileText },
] as const;

export function NewItem({ onChoose, onClose }: { onChoose: (kind: Kind) => void; onClose: () => void }) {
  return <Modal title="New item" onClose={onClose} className="compact-modal"><div className="choice-list">
    {kindIcons.map(({ kind, label, icon: Icon }) => <button key={kind} onClick={() => onChoose(kind)}><Icon size={19} />{label}</button>)}
  </div></Modal>;
}

export function Editor({ state, projects, onClose, onSave }: {
  state: EditorState; projects: Project[]; onClose: () => void; onSave: (value: EditorValue) => Promise<void>;
}) {
  const { kind, item } = state;
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? '').trim();
    if (!field('title') || (kind !== 'project' && !field('content'))) {
      setError(kind === 'project' ? 'Enter a project name.' : 'Enter a title and some content.');
      return;
    }
    const base = { id: item?.id ?? crypto.randomUUID(), title: field('title'), updatedAt: new Date().toISOString() };
    setSaving(true);
    setError('');
    try {
      if (kind === 'project') {
        const tags = [...new Map(field('tags').split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => [tag.toLowerCase(), tag])).values()];
        await onSave({ kind, item: { ...base, description: field('description'), path: field('path'), status: field('status') as Status, tags } });
      } else if (kind === 'snippet') {
        await onSave({ kind, item: { ...base, category: field('category') || 'General', content: String(form.get('content')) } });
      } else {
        await onSave({ kind, item: { ...base, topic: field('topic'), projectId: field('projectId'), content: String(form.get('content')) } });
      }
    } catch {
      setError('Could not save your changes. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return <Modal title={`${item ? 'Edit' : 'New'} ${kind}`} onClose={() => { if (!saving) onClose(); }}>
    <form className="editor-form" onSubmit={submit}>
      <label>{kind === 'project' ? 'Project name' : 'Title'}<input name="title" autoFocus required maxLength={120} defaultValue={item?.title} /></label>
      {state.kind === 'project' && <>
        <div className="form-grid">
          <label>Status<select name="status" aria-label="Status" defaultValue={state.item?.status ?? 'In Progress'}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Tags<input name="tags" placeholder="React, TypeScript" defaultValue={state.item?.tags.join(', ')} /></label>
        </div>
        <label>Local folder path<input name="path" placeholder="Enter an absolute folder path" defaultValue={state.item?.path} /></label>
        <label>Quick notes<textarea name="description" rows={3} defaultValue={state.item?.description} /></label>
      </>}
      {state.kind === 'snippet' && <>
        <label>Category<input name="category" placeholder="Git, Build, or General" defaultValue={state.item?.category} /></label>
        <label>Command or text<textarea className="monospace" name="content" rows={6} required defaultValue={state.item?.content} /></label>
      </>}
      {state.kind === 'note' && <>
        <div className="form-grid">
          <label>Topic<input name="topic" placeholder="Debugging" defaultValue={state.item?.topic} /></label>
          <label>Project<select name="projectId" aria-label="Project" defaultValue={state.item?.projectId || ''}><option value="">No linked project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
        </div>
        <label>Note <span className="field-hint">Markdown supported</span><textarea name="content" rows={8} required defaultValue={state.item?.content} /></label>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
    </form>
  </Modal>;
}

export function ConfirmDelete({ value, onClose, onDelete }: {
  value: EditorValue; onClose: () => void; onDelete: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    setSaving(true);
    setError('');
    try { await onDelete(); }
    catch { setError('Could not delete this item. Try again.'); }
    finally { setSaving(false); }
  }
  return <Modal title={`Delete ${value.kind}?`} className="compact-modal" onClose={() => { if (!saving) onClose(); }}>
    <p className="confirm-copy">Delete “{value.item.title}” from this workspace?{value.kind === 'project' && ' Linked notes will be kept.'}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="button secondary" autoFocus disabled={saving} onClick={onClose}>Cancel</button>
      <button className="button danger" disabled={saving} onClick={() => void remove()}><Trash2 size={16} />{saving ? 'Deleting…' : 'Delete'}</button></div>
  </Modal>;
}
