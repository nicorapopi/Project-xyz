import { useState, type FormEvent } from 'react';
import { FileText, Folder, Terminal, Trash2 } from 'lucide-react';
import { Modal } from './components';
import { statuses, type EditorState, type Kind, type Note, type Project, type Snippet } from './model';
import { editorSchemas } from './schema';
import { arrowFocus } from './useList';
import { mutationMessage } from './useWorkspace';
import type { ZodType } from 'zod';

export type EditorValue =
  | { kind: 'project'; item: Project }
  | { kind: 'snippet'; item: Snippet }
  | { kind: 'note'; item: Note };

const kindIcons = [
  { kind: 'project', label: 'Project', icon: Folder },
  { kind: 'snippet', label: 'Snippet', icon: Terminal },
  { kind: 'note', label: 'Note', icon: FileText },
] as const;

function invalidField<T extends object>(schema: ZodType<T>, candidate: T, previous?: T) {
  const result = schema.safeParse(candidate);
  if (result.success) return undefined;
  return result.error.issues.find(({ path }) => {
    const field = path[0] as keyof T;
    return !previous || JSON.stringify(previous[field]) !== JSON.stringify(candidate[field]);
  });
}

export function NewItem({ onChoose, onClose }: { onChoose: (kind: Kind) => void; onClose: () => void }) {
  return <Modal title="New item" onClose={onClose} className="compact-modal"><div className="choice-list" onKeyDown={arrowFocus}>
    {kindIcons.map(({ kind, label, icon: Icon }, index) => <button data-list-entry key={kind} autoFocus={index === 0} onClick={() => onChoose(kind)}><Icon size={19} />{label}</button>)}
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
    if (saving) return;
    const editor = event.currentTarget;
    const form = new FormData(editor);
    const field = (name: string) => String(form.get(name) ?? '').trim();
    const base = { id: item?.id ?? crypto.randomUUID(), title: field('title'), updatedAt: new Date().toISOString() };
    let value: EditorValue;
    let issue;
    if (state.kind === 'project') {
      const status = statuses.find((option) => option === field('status'));
      if (!status) { setError('Choose a valid project status.'); return; }
      const tags = [...new Map(field('tags').split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => [tag.toLowerCase(), tag])).values()];
      const candidate = { ...base, description: field('description'), path: field('path'), status, tags };
      issue = invalidField(editorSchemas.project, candidate, state.item);
      value = { kind: 'project', item: candidate };
    } else if (state.kind === 'snippet') {
      const candidate = { ...base, category: field('category') || 'General', content: String(form.get('content') ?? '') };
      issue = invalidField(editorSchemas.snippet, candidate, state.item);
      value = { kind: 'snippet', item: candidate };
    } else {
      const projectId = field('projectId');
      if (projectId && projectId !== state.item?.projectId && !projects.some((project) => project.id === projectId)) {
        setError('Choose an existing linked project.');
        return;
      }
      const candidate = { ...base, topic: field('topic'), projectId, content: String(form.get('content') ?? '') };
      issue = invalidField(editorSchemas.note, candidate, state.item);
      value = { kind: 'note', item: candidate };
    }
    if (issue) {
      setError(issue.message);
      const element = editor.elements.namedItem(String(issue.path[0]));
      if (element instanceof HTMLElement) element.focus();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(value);
    } catch (error: unknown) {
      setError(mutationMessage(error, 'Could not save your changes. Your draft is still here.'));
    } finally {
      setSaving(false);
    }
  }

  return <Modal title={`${item ? 'Edit' : 'New'} ${kind}`} onClose={() => { if (!saving) onClose(); }}>
    <form className="editor-form" onSubmit={submit} aria-busy={saving} aria-describedby={error ? 'editor-error' : undefined}>
      <fieldset className="editor-fields" disabled={saving}>
      <label>{kind === 'project' ? 'Project name' : 'Title'}<input name="title" autoFocus required maxLength={Math.max(120, item?.title.length ?? 0)} defaultValue={item?.title} /></label>
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
          <label>Project<select name="projectId" aria-label="Project" defaultValue={state.item?.projectId || ''}><option value="">No linked project</option>
            {state.item?.projectId && !projects.some((project) => project.id === state.item?.projectId) && <option value={state.item.projectId}>Unavailable linked project</option>}
            {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
        </div>
        <label>Note <span className="field-hint">Markdown supported</span><textarea name="content" rows={8} required defaultValue={state.item?.content} /></label>
      </>}
      </fieldset>
      {error && <p className="form-error" id="editor-error" role="alert">{error}</p>}
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
    catch (error: unknown) { setError(mutationMessage(error, 'Could not delete this item. It has been restored.')); }
    finally { setSaving(false); }
  }
  return <Modal title={`Delete ${value.kind}?`} className="compact-modal" onClose={() => { if (!saving) onClose(); }}>
    <p className="confirm-copy">Delete “{value.item.title}” from this workspace?{value.kind === 'project' && ' Linked notes will be kept.'}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="button secondary" autoFocus disabled={saving} onClick={onClose}>Cancel</button>
      <button className="button danger" disabled={saving} onClick={() => void remove()}><Trash2 size={16} />{saving ? 'Deleting…' : 'Delete'}</button></div>
  </Modal>;
}
