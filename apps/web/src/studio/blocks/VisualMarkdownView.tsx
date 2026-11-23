import { defaultValueCtx, Editor, editorViewCtx, rootCtx, serializerCtx } from '@milkdown/kit/core';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { history, redoCommand, undoCommand } from '@milkdown/kit/plugin/history';
import {
  commonmark,
  createCodeBlockCommand,
  toggleEmphasisCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark';
import { gfm, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm';
import { Plugin } from '@milkdown/kit/prose/state';
import { $prose, $remark, callCommand, getMarkdown, insert, replaceAll } from '@milkdown/kit/utils';
import { Button, Field, Input } from '@gurukul/ui';
import type { FieldControlProps } from '@gurukul/ui';
import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { isSafeLinkUrl, keepsMeaning } from './markdownMeaning';

interface Node {
  type: string;
  url?: string;
  children?: Node[];
}

/** Raw HTML goes, and a link to an address that is not http(s) or mailto is kept as its words. */
function clean(node: Node): Node[] {
  if (node.type === 'html') return [];
  const children = node.children?.flatMap(clean);
  if (node.type === 'link' && !isSafeLinkUrl(node.url as string)) return children as Node[];
  return [children ? { ...node, children } : node];
}

/** Text read into the editor, typed or pasted, never carries raw HTML or an unsafe link. */
const safeText = $remark('gurukul-safe-text', () => () => (tree: { children: Node[] }) => {
  tree.children = tree.children.flatMap(clean);
});

/** The toolbar; Link has no command, it asks for an address first. A command's key exists only once an editor has made it, so the click reads it. */
const TOOLS: Array<{
  name: string;
  command?: { key: unknown };
  payload?: unknown;
}> = [
  { name: 'Bold', command: toggleStrongCommand },
  { name: 'Italic', command: toggleEmphasisCommand },
  { name: 'Strikethrough', command: toggleStrikethroughCommand },
  { name: 'Heading 2', command: wrapInHeadingCommand, payload: 2 },
  { name: 'Heading 3', command: wrapInHeadingCommand, payload: 3 },
  { name: 'Paragraph', command: turnIntoTextCommand },
  { name: 'Bulleted list', command: wrapInBulletListCommand },
  { name: 'Numbered list', command: wrapInOrderedListCommand },
  { name: 'Link' },
  { name: 'Quote', command: wrapInBlockquoteCommand },
  { name: 'Code block', command: createCodeBlockCommand },
  { name: 'Undo', command: undoCommand },
  { name: 'Redo', command: redoCommand },
];

export const LINK_PROBLEM = 'Use an address that starts with https://, http:// or mailto:.';

/** The place the editor mounts. Once it has, its own box is the textbox: it takes the field's name and wiring. */
function EditorBox({
  host,
  label,
  ready,
  control,
}: {
  host: RefObject<HTMLDivElement | null>;
  label: string;
  ready: boolean;
  control: FieldControlProps;
}) {
  useLayoutEffect(() => {
    const box = host.current?.querySelector('[contenteditable]');
    if (!box) return;
    box.setAttribute('aria-label', label);
    box.setAttribute('aria-multiline', 'true');
    if (control['aria-invalid']) box.setAttribute('aria-invalid', 'true');
    else box.removeAttribute('aria-invalid');
    if (control['aria-describedby'])
      box.setAttribute('aria-describedby', control['aria-describedby']);
    else box.removeAttribute('aria-describedby');
  }, [host, label, ready, control]);
  return <div ref={host} className="prose studio-visual" />;
}

/**
 * Milkdown (ProseMirror + remark) as a labelled, controlled field with a formatting toolbar. Loaded
 * lazily: it is the second heavy part of Studio's editors. Before it shows, the text is read in and
 * written back; when that would change what it says, `onLossy` is called instead and nothing shows.
 * `onChange` is called only for an edit made here, never for opening a text.
 */
export default function VisualMarkdownView({
  label,
  hint,
  error,
  value,
  onChange,
  onLossy,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  value: string;
  onChange: (md: string) => void;
  onLossy: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<Editor | null>(null);
  const latest = useRef({ onChange, onLossy });
  const emitted = useRef(value);
  // Everything written since the page last showed our latest text: React may render an older one.
  const sent = useRef(new Set([value]));
  const quiet = useRef(true);
  const [ready, setReady] = useState(false);
  const [linking, setLinking] = useState(false);
  const [address, setAddress] = useState('https://');
  const [linkProblem, setLinkProblem] = useState<string | undefined>();

  useLayoutEffect(() => {
    latest.current = { onChange, onLossy };
  });

  // The editor is made once; a new value from outside goes in through the next effect.
  useLayoutEffect(() => {
    let gone = false;
    const made = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host.current);
        ctx.set(defaultValueCtx, emitted.current);
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(clipboard)
      .use(safeText)
      .use(
        $prose((ctx) => {
          return new Plugin({
            // A link mark made by a paste or a command that points anywhere but http(s) or mailto is removed.
            appendTransaction: (_trs, _old, state) => {
              const linkType = state.schema.marks.link;
              const tr = state.tr;
              state.doc.descendants((node, pos) => {
                const mark = node.marks.find(
                  (m) => m.type === linkType && !isSafeLinkUrl(m.attrs.href as string),
                );
                if (mark) tr.removeMark(pos, pos + node.nodeSize, mark);
              });
              return tr.docChanged ? tr : null;
            },
            view: () => ({
              update: (view, before) => {
                if (quiet.current || view.state.doc.eq(before.doc)) return;
                // remark always ends the text with a line break; a stored text does not.
                const md = ctx.get(serializerCtx)(view.state.doc).replace(/\n+$/, '');
                emitted.current = md;
                sent.current.add(md);
                latest.current.onChange(md);
              },
            }),
          });
        }),
      );
    void made.create().then(() => {
      if (gone) return;
      editor.current = made;
      const written = made.action(getMarkdown());
      quiet.current = false;
      if (keepsMeaning(emitted.current, written)) setReady(true);
      else latest.current.onLossy();
    });
    return () => {
      gone = true;
      editor.current = null;
      void made.destroy();
    };
  }, []);

  // A value that did not come from typing here (the course was reloaded, an edit was undone).
  useLayoutEffect(() => {
    const made = editor.current;
    if (!made) return;
    if (sent.current.has(value)) {
      if (value === emitted.current) sent.current = new Set([value]);
      return;
    }
    emitted.current = value;
    sent.current = new Set([value]);
    quiet.current = true;
    made.action(replaceAll(value));
    quiet.current = false;
    if (!keepsMeaning(value, made.action(getMarkdown()))) latest.current.onLossy();
  }, [value]);

  const run = (command: (m: Editor) => void) => {
    const made = editor.current as Editor;
    command(made);
    made.action((ctx) => ctx.get(editorViewCtx).focus());
  };
  const apply = (key: unknown, payload?: unknown) =>
    run((m) => m.action(callCommand(key as never, payload as never)));

  const addLink = () => {
    const href = address.trim();
    if (!isSafeLinkUrl(href)) return setLinkProblem(LINK_PROBLEM);
    run((m) => {
      const empty = m.action((ctx) => ctx.get(editorViewCtx).state.selection.empty);
      // With nothing selected the address is its own words.
      if (empty) m.action(insert(`[${href}](${href})`, true));
      else m.action(callCommand(toggleLinkCommand.key, { href }));
    });
    setLinking(false);
    setLinkProblem(undefined);
  };

  return (
    <div className="studio-text" hidden={!ready}>
      <div className="studio-toolbar" role="toolbar" aria-label={`${label} formatting`}>
        {TOOLS.map(({ name, command, payload }) => (
          <Button
            key={name}
            variant="ghost"
            onClick={() => (command ? apply(command.key, payload) : setLinking(true))}
          >
            {name}
          </Button>
        ))}
      </div>
      {linking ? (
        <div className="studio-row">
          <Input
            label="Link address"
            hint="https://, http:// or mailto: only."
            error={linkProblem}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <Button onClick={addLink}>Add link</Button>
          <Button variant="secondary" onClick={() => setLinking(false)}>
            Cancel
          </Button>
        </div>
      ) : null}
      <Field label={label} hint={hint} error={error}>
        {(control) => <EditorBox host={host} label={label} ready={ready} control={control} />}
      </Field>
    </div>
  );
}
