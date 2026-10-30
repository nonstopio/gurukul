import { Callout, CodeBlock, FileIcon, QuizOption, VideoBlock, Button } from '@gurukul/ui';
import type { Block, UnsupportedBlock } from '@gurukul/schema';
import { useState } from 'react';
import Markdown from 'react-markdown';
import { isEmbedAllowed, isPlaceholderVideo, videoEmbedUrl } from '@gurukul/schema';
import { TrackedVideo } from './TrackedVideo';

/** Markdown without raw HTML (react-markdown drops it); links always open in a new tab. */
export function Prose({ md }: { md: string }) {
  return (
    <div className="prose">
      <Markdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {md}
      </Markdown>
    </div>
  );
}

const LETTERS = ['A', 'B', 'C', 'D'] as const;

/** After reveal: the right option is marked, a wrong pick says so, the rest are closed. Without a key, all are closed. */
function optionState(
  correct: number | undefined,
  picked: number | null,
  i: number,
  revealed: boolean,
): 'idle' | 'locked' | 'correct' | 'incorrect' {
  if (!revealed) return 'idle';
  if (correct === i) return 'correct';
  return correct !== undefined && picked === i ? 'incorrect' : 'locked';
}

/** The ungraded "check yourself" block: the answer is revealed on submit, with no network. */
function CheckBlock({
  block,
  onAnswered,
}: {
  block: Extract<Block, { type: 'check' }>;
  onAnswered?: ((blockId: string) => void) | undefined;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  return (
    <fieldset className="check">
      <legend className="check__prompt">{block.prompt}</legend>
      {block.options.map((option, i) => (
        <QuizOption
          key={option}
          name={block.id}
          value={String(i)}
          letter={LETTERS[i % LETTERS.length] as (typeof LETTERS)[number]}
          checked={picked === i}
          state={optionState(block.correct, picked, i, revealed)}
          onChange={() => setPicked(i)}
        >
          {option}
        </QuizOption>
      ))}
      {revealed ? (
        <p role="status" className="check__explanation">
          {block.explanation}
        </p>
      ) : (
        <Button
          variant="secondary"
          disabled={picked === null}
          onClick={() => {
            setRevealed(true);
            onAnswered?.(block.id);
          }}
        >
          Show the answer
        </Button>
      )}
    </fieldset>
  );
}

/**
 * One renderer for every block type. A block this app cannot read (`readCourse` made it
 * `unsupported`), or a type it does not know, renders a visible notice. With `onWatched`, a video
 * tracks how much of it has been played and reports when it counts as watched; with `onAnswered`, a
 * check reports when its answer has been shown. A video that is not recorded yet renders nothing.
 */
export function BlockView({
  block,
  onWatched,
  onAnswered,
}: {
  block: Block | UnsupportedBlock;
  onWatched?: (blockId: string, watched: boolean) => void;
  onAnswered?: (blockId: string) => void;
}) {
  switch (block.type) {
    case 'video': {
      if (onWatched) return <TrackedVideo block={block} onWatched={onWatched} />;
      if (isPlaceholderVideo(block.url)) return null;
      const src = videoEmbedUrl(block.provider, block.url);
      return src ? (
        <VideoBlock
          src={src}
          title={block.title ?? 'Lesson video'}
          href={block.url}
          caption={block.caption}
        />
      ) : (
        <p>
          <a href={block.url} target="_blank" rel="noopener noreferrer">
            Open the video in a new tab
          </a>
        </p>
      );
    }
    case 'markdown':
      return <Prose md={block.md} />;
    case 'code':
      return (
        <CodeBlock
          code={block.code}
          copyable={block.copy}
          variant={block.terminal ? 'terminal' : 'code'}
          {...(block.file ? { fileName: block.file } : {})}
          {...(block.highlight ? { highlight: block.highlight } : {})}
        />
      );
    case 'callout':
      return (
        <Callout
          tone={block.tone}
          title={block.title ?? { note: 'Note', tip: 'Tip', warning: 'Warning' }[block.tone]}
        >
          <Prose md={block.md} />
        </Callout>
      );
    case 'image':
      return (
        <figure className="figure">
          <img src={block.url} alt={block.alt} loading="lazy" />
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      );
    case 'embed':
      return isEmbedAllowed(block.url) ? (
        <iframe
          className="embed"
          src={block.url}
          title={block.title}
          loading="lazy"
          allowFullScreen
        />
      ) : (
        <p>
          <a href={block.url} target="_blank" rel="noopener noreferrer">
            {block.title} (opens in a new tab)
          </a>
        </p>
      );
    case 'file':
      return (
        <a className="file-link" href={block.url} target="_blank" rel="noopener noreferrer">
          <FileIcon />
          {block.label}
        </a>
      );
    case 'check':
      return <CheckBlock block={block} onAnswered={onAnswered} />;
    default:
      return (
        <p role="note" className="unsupported">
          This content needs a newer version of the app.
        </p>
      );
  }
}
