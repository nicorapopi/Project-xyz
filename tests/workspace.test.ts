import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editorSchemas, isLocalPath, parseImport, snapshotSchema, webUrl } from '../src/schema';
import { initialWorkspace } from '../src/seed';
import { importEntries } from '../src/workspaceActions';

test('imports both saved versions without rewriting Markdown', () => {
  const original = structuredClone(initialWorkspace);
  original.notes[0].content += '\n\n    indented line\n';
  assert.deepEqual(parseImport(JSON.stringify({ 'workspace.v1': original })), original);
  assert.deepEqual(parseImport(JSON.stringify({ version: 2, revision: 3, workspace: original })), original);
});

test('rejects unknown versions, fields and duplicate IDs', () => {
  assert.throws(() => parseImport(JSON.stringify({ version: 9, revision: 2, workspace: initialWorkspace })));
  const invalid = structuredClone(initialWorkspace);
  invalid.projects.push(invalid.projects[0]);
  assert.throws(() => parseImport(JSON.stringify(invalid)));
  assert.throws(() => parseImport(JSON.stringify({ ...initialWorkspace, admin: true })));
  assert.equal(snapshotSchema.safeParse({ version: 2, revision: 0, workspace: initialWorkspace }).success, false);
});

test('validates absolute paths and safe outbound links', () => {
  for (const proposed of [
    '',
    'C:\\Users\\Dev Projects',
    '/Users/demo/Projects',
  ]) assert.equal(isLocalPath(proposed), true);
  for (const proposed of [
    'relative/path', '/Users/../Library', 'C:\\foo\\..\\bar', '\\\\server\\share',
    '\\\\?\\C:\\foo', 'C:\\AUX .txt', 'C:\\file:stream', '/tmp/a\u0000b',
  ]) assert.equal(isLocalPath(proposed), false, proposed);
  for (const proposed of ['javascript:alert(1)', 'file:///tmp', 'https://abc:123@example.com', 'https://exa\nmple.com']) {
    assert.equal(webUrl(proposed), null);
  }
  assert.equal(webUrl('https://example.com/docs'), 'https://example.com/docs');
  assert.equal(editorSchemas.note.safeParse({ ...initialWorkspace.notes[0], content: '\u0000bad' }).success, false);
});

test('import preserves existing entries and remaps conflicting project ID links', () => {
  const imported = structuredClone(initialWorkspace);
  imported.projects[0].title = 'Imported Orbit';
  const mutate = importEntries(imported);
  const merged = mutate(initialWorkspace);
  const added = merged.projects.find((project) => project.title === 'Imported Orbit');
  assert.ok(added);
  assert.notEqual(added.id, initialWorkspace.projects[0].id);
  assert.equal(merged.projects.length, initialWorkspace.projects.length + 1);
  assert.equal(merged.notes.length, initialWorkspace.notes.length + 1);
  assert.ok(merged.notes.some((note) => note.projectId === added.id));
  assert.equal(merged.notes[0].projectId, initialWorkspace.notes[0].projectId);
  assert.deepEqual(mutate(initialWorkspace), merged);
});
