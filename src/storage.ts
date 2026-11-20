import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Workspace } from './model';
import { MAX_WORKSPACE_BYTES, snapshotSchema, workspaceSchema, webUrl } from './schema';
import { initialWorkspace } from './seed';

const browserLegacyKey = 'nexadesk.workspace.v1';
export const browserKey = 'nexadesk.workspace.v2';
export const desktop = isTauri();

export interface Snapshot {
  revision: number;
  workspace: Workspace;
  encrypted: boolean;
}

export class StorageError extends Error {
  constructor(readonly code: 'conflict' | 'corrupt' | 'blocked' | 'too-large' | 'invalid' | 'key-unavailable' | 'recovery-required') {
    super(code);
  }
}

function checkSize(raw: string) {
  if (raw.length > MAX_WORKSPACE_BYTES || new Blob([raw]).size > MAX_WORKSPACE_BYTES) throw new StorageError('too-large');
}

function parseJson(raw: string): unknown {
  checkSize(raw);
  try { return JSON.parse(raw); }
  catch { throw new StorageError('corrupt'); }
}

function parseSnapshot(raw: unknown): Omit<Snapshot, 'encrypted'> {
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) throw new StorageError('corrupt');
  return parsed.data;
}

async function native<T>(command: string, args?: Record<string, unknown>) {
  try { return await invoke<T>(command, args); }
  catch (error: unknown) {
    if (error === 'conflict' || error === 'corrupt' || error === 'too-large' || error === 'invalid') throw new StorageError(error);
    if (error === 'key-unavailable' || error === 'recovery-required') throw new StorageError(error);
    throw new StorageError('blocked');
  }
}

function withBrowserLock<T>(operation: () => T): Promise<T> {
  return navigator.locks ? navigator.locks.request(browserKey, operation) : Promise.resolve().then(operation);
}

function loadBrowser(): Snapshot {
  const current = localStorage.getItem(browserKey);
  if (current !== null) return { ...parseSnapshot(parseJson(current)), encrypted: false };
  const legacy = localStorage.getItem(browserLegacyKey);
  if (legacy === null) return { revision: 0, workspace: initialWorkspace, encrypted: false };
  const data = workspaceSchema.safeParse(parseJson(legacy));
  if (!data.success) throw new StorageError('corrupt');
  // The legacy key is the exact pre-migration snapshot and remains untouched.
  const migrated = { version: 2, revision: 1, workspace: data.data };
  localStorage.setItem(browserKey, JSON.stringify(migrated));
  return { ...migrated, encrypted: false };
}

export async function readWorkspace(): Promise<Snapshot> {
  if (!desktop) return withBrowserLock(loadBrowser);
  const raw = await native<unknown>('read_workspace');
  if (!raw || typeof raw !== 'object' || !('encrypted' in raw) || typeof raw.encrypted !== 'boolean' || !('snapshot' in raw)) {
    throw new StorageError('corrupt');
  }
  if (raw.snapshot === null && !raw.encrypted) return { revision: 0, workspace: initialWorkspace, encrypted: false };
  return { ...parseSnapshot(raw.snapshot), encrypted: raw.encrypted };
}

export function enableWorkspaceEncryption(initialWorkspace: Workspace, expectedRevision: number) {
  return native<number>('enable_workspace_encryption', { initialWorkspace, expectedRevision });
}

export async function saveWorkspace(workspace: Workspace, expectedRevision: number): Promise<number> {
  if (desktop) return native<number>('write_workspace', { workspace, expectedRevision });
  return withBrowserLock(() => {
    const { revision } = loadBrowser();
    if (revision !== expectedRevision) throw new StorageError('conflict');
    const next = revision + 1;
    const raw = JSON.stringify({ version: 2, revision: next, workspace });
    checkSize(raw);
    localStorage.setItem(browserKey, raw);
    return next;
  });
}

export async function copyText(text: string) {
  if (desktop) {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
    await writeText(text);
  } else {
    await navigator.clipboard.writeText(text);
  }
}

export function revealFolder(projectId: string) {
  return native<void>('reveal_project_folder', { projectId });
}

export function openWebLink(url: string) {
  const safe = webUrl(url);
  return safe && desktop ? native<void>('open_web_link', { url: safe }) : Promise.reject(new StorageError('blocked'));
}
