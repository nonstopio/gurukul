import {
  Button,
  Callout,
  Card,
  CodeBlock,
  MASCOT_EXPRESSIONS,
  MASCOT_STATES,
  Mascot,
  Page,
  PageHeader,
} from '@gurukul/ui';
import type { MascotExpression, MascotState } from '@gurukul/ui';
import { useState } from 'react';
import { useTerms } from '../labels/useTerms';
import './mascot-page.css';

const EXPRESSIONS = Object.entries(MASCOT_EXPRESSIONS) as Array<[MascotExpression, string]>;
const STATES = Object.keys(MASCOT_STATES) as MascotState[];
const SIZES = [24, 32, 40, 64, 96, 128];

const USAGE = `import { Mascot } from '@gurukul/ui';

// A product moment: the state picks the face.
<Mascot state="empty" size={80} />

// A compact face beside a line of text.
<Mascot state="tip" variant="face" size={32} />

// A loader: its words live in one status region.
<div role="status">
  <Mascot state="loading" variant="loading" size={56} />
  <span>Loading your courses</span>
</div>

// A label only when the owl says something the words beside it do not.
<Mascot expression="celebrate" size={128} label="The owl, celebrating" />`;

/** `/admin/mascot`: the owl's studio. Pick a face, watch it load, pick a state, copy the code. */
export function MascotPage() {
  const t = useTerms();
  const [expression, setExpression] = useState<MascotExpression>('neutral');
  const [face, setFace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<MascotState>('empty');
  const [paused, setPaused] = useState(false);
  const label = MASCOT_EXPRESSIONS[expression];

  // When to use each state, and a line of copy that goes beside the owl.
  const notes: Record<MascotState, { use: string; sample: string }> = {
    idle: { use: 'A page waiting for the person to start', sample: 'Ready when you are.' },
    info: { use: 'A neutral note or an explanation', sample: 'Here is how this page works.' },
    success: { use: 'An action that worked', sample: 'Saved. Keep going.' },
    complete: { use: 'A course or a task finished', sample: 'Course complete. Nice work.' },
    milestone: {
      use: 'A first, a streak or a certificate',
      sample: 'Your first certificate is ready.',
    },
    empty: {
      use: 'A list with nothing in it yet',
      sample: 'Nothing here yet. Your next course is a good place to start.',
    },
    notFound: {
      use: 'A page or record that does not exist',
      sample: 'No page here. Check the link.',
    },
    loading: { use: 'Waiting on data, inside a status region', sample: 'Loading your courses' },
    review: { use: 'Something to look over before going on', sample: 'Take a moment to review.' },
    tip: {
      use: `A hint, and a ${t.learner}'s wrong answer`,
      sample: 'Not quite. Read the explanation, then try again.',
    },
    new: { use: 'A feature someone has not seen yet', sample: 'This page is new.' },
    validation: { use: 'A field to fix', sample: 'Check the highlighted field.' },
    warning: {
      use: 'Something that can go wrong next',
      sample: 'Review this step before continuing.',
    },
    error: {
      use: 'A failure of Gurukul, never of the person',
      sample: 'This did not load. Try again.',
    },
  };

  return (
    <Page>
      <PageHeader
        eyebrow={t.Admin}
        title="Mascot"
        lead="The owl that keeps people company in empty pages, tips and loaders: every face, and when to use it."
      />

      <Card title="A watchful eye. A curious mind.">
        <div className="mascot-hero">
          <div className="mascot-hero__copy">
            <p>
              Gurukul&apos;s companion: a green owl with a saffron belly, a little encouragement
              beside the words as people learn.
            </p>
            <p>
              <strong>{label}</strong>
            </p>
            <div className="mascot-buttons">
              <Button
                variant="secondary"
                aria-pressed={face}
                onClick={() => {
                  setFace(!face);
                  setLoading(false);
                }}
              >
                Show face only
              </Button>
              <Button
                variant="secondary"
                aria-pressed={loading}
                onClick={() => setLoading(!loading)}
              >
                Play loading loop
              </Button>
            </div>
          </div>
          <Mascot
            expression={expression}
            variant={loading ? 'loading' : face ? 'face' : 'body'}
            size={240}
            paused={paused}
            label={`The owl, ${label.toLowerCase()}`}
          />
        </div>
      </Card>

      <Card title="A face for the moment">
        <p>Choose an expression to preview it.</p>
        <div className="mascot-tiles" role="group" aria-label="Expressions">
          {EXPRESSIONS.map(([key, name]) => (
            <Button
              key={key}
              variant="secondary"
              className="mascot-tile"
              aria-pressed={key === expression}
              onClick={() => setExpression(key)}
            >
              <Mascot expression={key} variant="face" size={72} />
              <span>{name}</span>
              <code>{key}</code>
            </Button>
          ))}
        </div>
      </Card>

      <Card title="While you wait">
        <p>
          The owl waddles in place, wings flapping, while a page loads. The words beside it say what
          is loading.
        </p>
        <div className="mascot-row">
          <figure>
            <div role="status" className="mascot-status">
              <Mascot state="loading" variant="loading" size={96} paused={paused} />
              <span>Loading your courses</span>
            </div>
            <figcaption>A page loading, 96px</figcaption>
          </figure>
          <figure>
            <div role="status" className="mascot-status mascot-status--inline">
              <Mascot state="loading" variant="loading" size={56} paused={paused} />
              <span>Loading the results</span>
            </div>
            <figcaption>Inline, 56px</figcaption>
          </figure>
        </div>
        <div className="mascot-buttons">
          <Button variant="secondary" aria-pressed={paused} onClick={() => setPaused(!paused)}>
            Pause animations
          </Button>
        </div>
        <p>
          With reduced motion on, the owl stands still and only fades gently. The words say what is
          loading either way.
        </p>
      </Card>

      <Card title="Small enough to belong">
        <p>The face at 24–40px; the whole owl from 56px, when there is room around it.</p>
        <ul className="mascot-row">
          {SIZES.map((size) => (
            <li key={size}>
              <Mascot variant={size < 64 ? 'face' : 'body'} size={size} />
              <span>{size}px</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="React to the state">
        <p>Choose a state. One shared mapping keeps the owl the same everywhere.</p>
        <div className="mascot-buttons" role="group" aria-label="States">
          {STATES.map((key) => (
            <Button
              key={key}
              variant="secondary"
              aria-pressed={key === state}
              onClick={() => setState(key)}
            >
              {key}
            </Button>
          ))}
        </div>
        <div className="mascot-message">
          <Mascot
            state={state}
            variant={state === 'loading' ? 'loading' : 'body'}
            size={80}
            paused={paused}
          />
          <div>
            <p>
              <code>
                {state} → {MASCOT_STATES[state]}
              </code>
            </p>
            <p>{notes[state].sample}</p>
            <p>Use it for: {notes[state].use.toLowerCase()}</p>
          </div>
        </div>
      </Card>

      <Card title="Light and dark grounds">
        <div className="mascot-row">
          <figure>
            <Mascot expression={expression} size={128} ground="light" />
            <figcaption>Light ground</figcaption>
          </figure>
          <figure>
            <Mascot expression={expression} size={128} ground="dark" />
            <figcaption>Dark ground</figcaption>
          </figure>
        </div>
        <p>The dark ground lifts the owl&apos;s green so it does not sink into the page.</p>
      </Card>

      <Card title="Made to be reused">
        <p>
          Use a state for product moments, and an expression only for art like this page. One owl
          per region, beside the text it reacts to.
        </p>
        <CodeBlock code={USAGE} fileName="Mascot.tsx" />
        <p>
          Decorative by default. Add a label when the artwork says something on its own. Keep errors
          and guidance in visible text.
        </p>
        <Callout tone="warning" title="Never a sad face for a wrong answer">
          {`A ${t.learner} who gets a ${t.quiz} question wrong sees the tip face and an explanation. The sad face is for what Gurukul got wrong: a failed load or a failed save.`}
        </Callout>
      </Card>
    </Page>
  );
}
