import { useState } from 'react';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { Modal } from './components';
import { mutationMessage } from './useWorkspace';

export function EncryptionSettings({ encrypted, busy, onEnable }: { encrypted: boolean; busy: boolean; onEnable: () => void }) {
  const Icon = encrypted ? ShieldCheck : ShieldOff;
  return <section className="surface settings-card">
    <h2><Icon size={18} /> Workspace encryption</h2>
    {encrypted ? <>
      <p>The active workspace and its rolling backup are encrypted. This OS account holds the key.</p>
      <p className="storage-hint">Earlier migration files and exported copies may still contain readable data.</p>
    </> : <>
      <p>Encrypt saved projects, snippets, and notes with a key held by this OS account.</p>
      <button className="button secondary import-button" disabled={busy} onClick={onEnable}><ShieldCheck size={16} /> Enable encryption</button>
    </>}
  </section>;
}

export function ConfirmEncryption({ onClose, onEnable }: { onClose: () => void; onEnable: () => Promise<void> }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  async function enable() {
    if (working) return;
    setWorking(true);
    setError('');
    try { await onEnable(); }
    catch (error: unknown) {
      setError(mutationMessage(error, 'Could not finish enabling encryption. Keep all workspace files and reopen NexaDesk to check their status.'));
    } finally { setWorking(false); }
  }

  return <Modal title="Encrypt this workspace?" className="compact-modal" onClose={() => { if (!working) onClose(); }}>
    <p className="confirm-copy">Opening the encrypted workspace or restoring its backup requires NexaDesk 0.3 or later and the original OS credential.</p>
    <p className="confirm-copy">Earlier migration files and exported copies stay as they are.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions">
      <button className="button secondary" autoFocus disabled={working} onClick={onClose}>Cancel</button>
      <button className="button primary" disabled={working} onClick={() => void enable()}>
        {working ? 'Encrypting…' : 'Encrypt workspace'}
      </button>
    </div>
  </Modal>;
}
