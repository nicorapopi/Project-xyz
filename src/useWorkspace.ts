import { useCallback, useEffect, useRef, useState } from 'react';
import type { Workspace } from './model';
import { browserKey, desktop, readWorkspace, saveWorkspace, StorageError, type Snapshot } from './storage';

export type Mutation = (workspace: Workspace) => Workspace;

interface Pending {
  apply: Mutation;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'failure'; message: string }
  | { phase: 'ready'; workspace: Workspace; pending: number };

function loadMessage(error: unknown) {
  if (error instanceof StorageError && error.code === 'corrupt') {
    return 'The saved workspace could not be read. Keep the original files and restore a known-good copy before retrying.';
  }
  if (error instanceof StorageError && error.code === 'too-large') {
    return 'The saved workspace exceeds 64 MB. Keep a copy before reducing its size.';
  }
  return 'Check that the app data folder or browser storage is available, then try again.';
}

export function mutationMessage(error: unknown, fallback: string) {
  if (error instanceof StorageError && error.code === 'conflict') return 'The workspace changed in another window. Review the latest data before retrying.';
  if (error instanceof StorageError && error.code === 'too-large') return 'This change would exceed the workspace size limit.';
  if (error instanceof StorageError && error.code === 'invalid') return 'Check the changed fields and linked project, then try again.';
  return fallback;
}

export function useWorkspace() {
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const saved = useRef<Snapshot | null>(null);
  const queue = useRef<Pending[]>([]);
  const processing = useRef(false);
  const loadGeneration = useRef(0);

  const publish = useCallback(() => {
    if (!saved.current) return;
    setState({
      phase: 'ready',
      workspace: queue.current.reduce((data, operation) => operation.apply(data), saved.current.workspace),
      pending: queue.current.length,
    });
  }, []);

  const reload = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setState({ phase: 'loading' });
    try {
      const snapshot = await readWorkspace();
      if (loadGeneration.current === generation) {
        saved.current = snapshot;
        publish();
      }
    } catch (error: unknown) {
      if (loadGeneration.current === generation) setState({ phase: 'failure', message: loadMessage(error) });
    }
  }, [publish]);

  useEffect(() => {
    void reload();
    return () => { loadGeneration.current++; };
  }, [reload]);

  useEffect(() => {
    if (desktop) return;
    const refresh = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || event.key !== browserKey || !saved.current || processing.current) return;
      const revision = saved.current.revision;
      void readWorkspace().then((snapshot) => {
        if (!processing.current && saved.current?.revision === revision) {
          saved.current = snapshot;
          publish();
        }
      }).catch(() => undefined);
    };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [publish]);

  const drain = useCallback(async () => {
    if (processing.current) return;
    processing.current = true;
    try {
      while (queue.current.length && saved.current) {
        const operation = queue.current[0];
        const previous = saved.current;
        try {
          const workspace = operation.apply(previous.workspace);
          const revision = await saveWorkspace(workspace, previous.revision);
          saved.current = { revision, workspace };
          queue.current.shift();
          publish();
          operation.resolve();
        } catch (error: unknown) {
          if (error instanceof StorageError && error.code === 'conflict') {
            const conflicting = queue.current.splice(0);
            try { saved.current = await readWorkspace(); }
            catch { /* Keep the last readable state and let the user retry. */ }
            publish();
            for (const pending of conflicting) pending.reject(error);
          } else {
            queue.current.shift();
            publish();
            operation.reject(error);
          }
        }
      }
    } finally {
      processing.current = false;
    }
  }, [publish]);

  const mutate = useCallback((apply: Mutation) => new Promise<void>((resolve, reject) => {
    if (!saved.current) { reject(new StorageError('blocked')); return; }
    queue.current.push({ apply, resolve, reject });
    publish();
    void drain();
  }), [drain, publish]);

  return { state, mutate, reload };
}
