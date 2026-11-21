import { useState, type FormEvent } from 'react';
import { Archive, Download, Upload } from 'lucide-react';
import { Modal } from './components';
import { mutationMessage } from './useWorkspace';

export type BackupAction = 'export' | 'restore';

export function PortableBackupSettings({ busy, onAction }: { busy: boolean; onAction: (action: BackupAction) => void }) {
  return <section className="surface settings-card">
    <h2><Archive size={18} /> Portable backups</h2>
    <p>Use a passphrase to move or recover your projects, snippets, and notes on another device.</p>
    <div className="theme-options">
      <button className="button secondary" disabled={busy} onClick={() => onAction('export')}><Download size={16} /> Export encrypted backup</button>
      <button className="button secondary" disabled={busy} onClick={() => onAction('restore')}><Upload size={16} /> Restore backup</button>
    </div>
  </section>;
}

export function PortableBackupDialog({ action, onClose, onSubmit }: {
  action: BackupAction; onClose: () => void; onSubmit: (passphrase: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const exporting = action === 'export';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const passphrase = String(fields.get('passphrase') ?? '');
    if (Array.from(passphrase).length < 12 || new TextEncoder().encode(passphrase).length > 256 || !passphrase.trim()) {
      setError('Use at least 12 characters and at most 256 UTF-8 bytes.');
      return;
    }
    if (exporting && passphrase !== fields.get('confirmation')) {
      setError('The passphrases do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (await onSubmit(passphrase)) form.reset();
    } catch (error: unknown) {
      setError(mutationMessage(error, 'The backup operation could not finish. Check that the selected location is available.'));
    } finally { setBusy(false); }
  }

  return <Modal title={exporting ? 'Export encrypted backup' : 'Restore a portable backup?'} onClose={() => { if (!busy) onClose(); }}>
    <p className="confirm-copy">{exporting
      ? 'Use a strong passphrase you can keep separately. You will need it to open this file.'
      : 'Restoring replaces the current workspace. NexaDesk first saves a separate encrypted copy of your current data using the passphrase you enter here.'}</p>
    <form className="editor-form" aria-busy={busy} onSubmit={submit}>
      <fieldset className="editor-fields" disabled={busy}>
        <label>Passphrase<input type="password" name="passphrase" autoComplete={exporting ? 'new-password' : 'off'} autoFocus required maxLength={256} /></label>
        {exporting && <label>Confirm passphrase<input type="password" name="confirmation" autoComplete="new-password" required maxLength={256} /></label>}
      </fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button className={exporting ? 'button primary' : 'button danger'} disabled={busy}>
          {busy ? (exporting ? 'Exporting…' : 'Restoring…') : exporting ? 'Choose where to save' : 'Choose backup and restore'}
        </button>
      </div>
    </form>
  </Modal>;
}
