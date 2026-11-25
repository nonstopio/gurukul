import { describe, expect, it, vi } from 'vitest';
import { revealLabel } from '../src/studio/session/SourcesPanel';
import {
  SOURCE_REFUSALS,
  bridgeSources,
  filesLabel,
  sourceRefusal,
} from '../src/studio/session/sources';
import { SourceRefusedError, defaultToolContext } from '../src/studio/session/tools';
import { call, json, refused, toolState } from './session-tools-fixture';
import { SOURCES_FOLDER, fakeDesktop } from './fake-desktop';

const ref = { uid: 'u1', sessionId: 's1' };
/** How Electron hands the window a rejected call. */
const rejected = (message: string) =>
  new Error(`Error invoking remote method 'gurukul:sources.read': Error: ${message}`);

describe('sourceRefusal', () => {
  it('finds the shell’s sentence at the end of a rejected read', () => {
    expect(sourceRefusal(rejected(SOURCE_REFUSALS.notText))).toBe(SOURCE_REFUSALS.notText);
    for (const sentence of Object.values(SOURCE_REFUSALS))
      expect(sourceRefusal(rejected(sentence))).toBe(sentence);
  });

  it('is null for any other failure', () => {
    expect(sourceRefusal(rejected('sources.read failed (EIO)'))).toBeNull();
    expect(sourceRefusal('not an error')).toBeNull();
  });
});

describe('bridgeSources', () => {
  it('lists null until a folder is made, then its files', async () => {
    const { desktop } = fakeDesktop({ noSources: true });
    const sources = bridgeSources(desktop.sources, ref);
    await expect(sources.list()).resolves.toBeNull();
    await desktop.sources.ensure(ref);
    await expect(sources.list()).resolves.toEqual(SOURCES_FOLDER.files);
    expect(desktop.sources.list).toHaveBeenCalledWith(ref);
  });

  it('reads a file of this session by its plain name', async () => {
    const { desktop } = fakeDesktop();
    const sources = bridgeSources(desktop.sources, ref);
    await desktop.sources.ensure(ref);
    await expect(sources.read('Rebase notes.md')).resolves.toBe('Text of Rebase notes.md');
    expect(desktop.sources.read).toHaveBeenCalledWith(ref, 'Rebase notes.md');
    await expect(sources.read('missing.md')).resolves.toBeNull();
  });

  it('reads a picture of this session, and hands on a refusal as a sentence', async () => {
    const { desktop } = fakeDesktop();
    const sources = bridgeSources(desktop.sources, ref);
    await desktop.sources.ensure(ref);
    await expect(sources.readImage('Rebase notes.md')).resolves.toEqual({
      data: 'AQID',
      mimeType: 'image/png',
    });
    expect(desktop.sources.readImage).toHaveBeenCalledWith(ref, 'Rebase notes.md');
    desktop.sources.readImage.mockRejectedValueOnce(rejected(SOURCE_REFUSALS.imageTooLarge));
    await expect(sources.readImage('big.png')).rejects.toBeInstanceOf(SourceRefusedError);
  });

  it('turns the shell’s refusal into a sentence for the agent, and passes other failures on', async () => {
    const read = vi.fn(async () => {
      throw rejected(SOURCE_REFUSALS.notText);
    });
    const sources = bridgeSources({ list: vi.fn(), read, readImage: vi.fn() }, ref);
    const refusal = sources.read('slides.pdf');
    await expect(refusal).rejects.toBeInstanceOf(SourceRefusedError);
    await expect(refusal).rejects.toThrow(SOURCE_REFUSALS.notText);
    const failure = rejected('sources.read failed (EIO)');
    read.mockRejectedValueOnce(failure);
    await expect(sources.read('notes.md')).rejects.toBe(failure);
  });

  it('backs the agent’s list_sources and read_source', async () => {
    const { desktop } = fakeDesktop({ noSources: true });
    const ctx = defaultToolContext(bridgeSources(desktop.sources, ref));
    expect(await refused(call(toolState(), 'list_sources', {}, ctx))).toMatch(
      /^This session has no Sources folder yet/,
    );
    await desktop.sources.ensure(ref);
    expect(await json(call(toolState(), 'list_sources', {}, ctx))).toEqual({
      files: SOURCES_FOLDER.files,
    });
    expect(
      await json(call(toolState(), 'read_source', { name: 'transcript.txt' }, ctx)),
    ).toMatchObject({ text: 'Text of transcript.txt' });
  });
});

describe('labels', () => {
  it('counts the files of the folder', () => {
    expect(filesLabel({ path: '~/x', files: [] })).toBe('No files yet');
    expect(filesLabel({ path: '~/x', files: [{ name: 'a.md', bytes: 1 }] })).toBe('1 file');
    expect(filesLabel(SOURCES_FOLDER)).toBe('2 files');
  });

  it('names Finder, Explorer, or neither', () => {
    expect(revealLabel('darwin')).toBe('Show in Finder');
    expect(revealLabel('win32')).toBe('Show in Explorer');
    expect(revealLabel('linux')).toBe('Show the folder');
  });
});
