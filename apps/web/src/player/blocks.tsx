import { Callout, CodeBlock, QuizOption, VideoBlock, Button } from '@gurukul/ui';
import type { Block, UnsupportedBlock } from '@gurukul/schema';
import { useState } from 'react';
import Markdown from 'react-markdown';
import { isEmbedAllowed, videoEmbedUrl } from '@gurukul/schema';

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

/** The ungraded "check yourself" block: the answer is revealed on submit, with no network. */
function CheckBlock({ block }: { block: Extract<Block, { type: 'check' }> }) {
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
          state={revealed ? 'locked' : 'idle'}
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
        <Button variant="secondary" disabled={picked === null} onClick={() => setRevealed(true)}>
          Show the answer
        </Button>
      )}
    </fieldset>
  );
}

/**
 * One renderer for every block type. A block this app cannot read (`readCourse` made it
 * `unsupported`), or a type it does not know, renders a visible notice.
 */
export function BlockView({ block }: { block: Block | UnsupportedBlock }) {
  switch (block.type) {
    case 'video': {
      const src = videoEmbedUrl(block.provider, block.url);
      return src ? (
        <VideoBlock src={src} title="Lesson video" href={block.url} />
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
          {block.label}
        </a>
      );
    case 'check':
      return <CheckBlock block={block} />;
    default:
      return (
        <p role="note" className="unsupported">
          This content needs a newer version of the app.
        </p>
      );
  }
}
