import { isTauri } from '@tauri-apps/api/core';
import { isWorkspace, type Workspace } from './model';
import { initialWorkspace } from './seed';

const browserKey = 'nexadesk.workspace.v1';
const nativeKey = 'workspace.v1';
export const desktop = isTauri();

async function nativeStore() {
  const { load } = await import('@tauri-apps/plugin-store');
  return load('workspace.json', { autoSave: false, defaults: {} });
}

let pendingWrite: Promise<void> = Promise.resolve();

export async function readWorkspace(): Promise<Workspace> {
  const raw = desktop ? await (await nativeStore()).get<unknown>(nativeKey) : localStorage.getItem(browserKey);
  const data: unknown = typeof raw === 'string' && !desktop ? JSON.parse(raw) : raw;
  if (data == null) return initialWorkspace;
  if (!isWorkspace(data)) throw new Error('The saved workspace has an unsupported format.');
  return data;
}

export function saveWorkspace(workspace: Workspace) {
  const write = pendingWrite.catch(() => undefined).then(async () => {
    if (desktop) {
      const store = await nativeStore();
      await store.set(nativeKey, workspace);
      await store.save();
    } else {
      localStorage.setItem(browserKey, JSON.stringify(workspace));
    }
  });
  pendingWrite = write;
  return write;
}

export async function copyText(text: string) {
  if (desktop) {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
    await writeText(text);
  } else {
    await navigator.clipboard.writeText(text);
  }
}

export async function revealFolder(path: string) {
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
  await revealItemInDir(path);
}
