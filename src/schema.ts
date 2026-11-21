import { z } from 'zod';
import { statuses, type Workspace } from './model';

export const MAX_WORKSPACE_BYTES = 64 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 16 * 1024 * 1024;

const singleLine = /^[^\p{Cc}]*$/u;
const safeContent = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]*$/u;
const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const date = z.iso.datetime({ offset: true });
const storedEntry = { id, title: z.string().min(1), updatedAt: date };
const theme = z.enum(['light', 'dark', 'system']);
const status = z.enum(statuses);
const storedProject = z.strictObject({ ...storedEntry, description: z.string(), tags: z.array(z.string()), status, path: z.string() });
const storedSnippet = z.strictObject({ ...storedEntry, category: z.string(), content: z.string() });
const storedNote = z.strictObject({ ...storedEntry, topic: z.string(), projectId: z.union([z.literal(''), id]), content: z.string() });

const workspaceShape = {
  projects: z.array(storedProject),
  snippets: z.array(storedSnippet),
  notes: z.array(storedNote),
  theme,
};

function uniqueIds(workspace: Workspace, context: z.RefinementCtx) {
  for (const key of ['projects', 'snippets', 'notes'] as const) {
    const ids = new Set<string>();
    for (const item of workspace[key]) {
      if (ids.has(item.id)) {
        context.addIssue({ code: 'custom', path: [key], message: 'Duplicate item identifiers.' });
        break;
      }
      ids.add(item.id);
    }
  }
}
export const workspaceSchema = z.strictObject(workspaceShape).superRefine(uniqueIds);
export const snapshotSchema = z.strictObject({
  version: z.literal(2),
  revision: z.number().int().min(1),
  workspace: workspaceSchema,
});

export function isLocalPath(value: string) {
  if (value === '') return true;
  if (value.length > 4096 || !singleLine.test(value)) return false;
  const windowsDrive = /^[a-zA-Z]:[\\/]/.test(value);
  if (windowsDrive) {
    return !/[:*?"<>|]/.test(value.slice(2)) &&
      value.slice(3).split(/[\\/]/).every((part) => !part || !/[. ]$/.test(part) &&
        !/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i.test(part.split('.')[0].trimEnd()));
  }
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') &&
    !value.split('/').some((part) => part === '.' || part === '..');
}

const text = (limit: number) => z.string().max(limit, 'This field is too long.').regex(singleLine, 'Remove control characters from this field.');
const title = text(120).refine((value) => !!value.trim(), 'Enter a title.');
const multiline = (limit: number) => z.string().max(limit, 'This field is too long.').regex(safeContent, 'Remove control characters from this field.');
const content = (limit: number) => multiline(limit).refine((value) => !!value.trim(), 'Enter some content.');
const path = z.string().refine(isLocalPath, 'Enter an absolute local folder path without parent segments.');

export const editorSchemas = {
  project: storedProject.extend({ title, tags: z.array(text(48).min(1)).max(24, 'Use up to 24 tags.'), description: multiline(16_000), path }),
  snippet: storedSnippet.extend({ title, category: text(80).min(1), content: content(128_000) }),
  note: storedNote.extend({ title, topic: text(80), content: content(512_000) }),
};

const importSchema = z.strictObject({
  projects: z.array(editorSchemas.project).max(10_000),
  snippets: z.array(editorSchemas.snippet).max(10_000),
  notes: z.array(editorSchemas.note).max(10_000),
  theme,
}).superRefine(uniqueIds);

export class ImportError extends Error {}
export function parseImport(raw: string): Workspace {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new ImportError('Choose a valid NexaDesk JSON file.'); }

  if (value && typeof value === 'object' && 'version' in value) {
    if (value.version === 3 && 'ciphertext' in value) throw new ImportError('Restore encrypted backups through the desktop app data folder on the original OS account.');
    if (value.version !== 2 || !('workspace' in value)) throw new ImportError('This workspace file uses an unsupported version.');
    const envelope = snapshotSchema.safeParse(value);
    if (!envelope.success) throw new ImportError('The workspace file is damaged or has an unsupported format.');
    value = envelope.data.workspace;
  } else if (value && typeof value === 'object' && 'workspace.v1' in value) {
    const legacy = z.strictObject({ 'workspace.v1': workspaceSchema }).safeParse(value);
    if (!legacy.success) throw new ImportError('The workspace file is damaged or has an unsupported format.');
    value = legacy.data['workspace.v1'];
  }

  const result = importSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ImportError(issue?.code === 'custom' || issue?.path.length > 1
      ? 'An item is invalid. Check field lengths, identifiers, and absolute folder paths, then try again.'
      : 'The file does not match the NexaDesk workspace format.');
  }
  return result.data;
}

export function webUrl(value: string) {
  if (value.length > 4096 || !singleLine.test(value) || !/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
