import { useId } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { CheckIcon } from './Icon';
import { cx } from './cx';
import './stepper.css';

export interface StepCardProps {
  /** The step's number, drawn in the badge. */
  number: number;
  title: string;
  /** Heading level to fit the page. Default: `h2`. */
  headingAs?: 'h2' | 'h3' | 'h4';
  children: ReactNode;
}

/** One numbered step of a form: a labelled `<section>` with a number badge and a title. */
export function StepCard({ number, title, headingAs: Heading = 'h2', children }: StepCardProps) {
  const id = useId();
  return (
    <section className="g-step" aria-labelledby={id}>
      <div className="g-step__head">
        <span className="g-step__badge" aria-hidden="true">
          {number}
        </span>
        <Heading className="g-step__title" id={id}>
          <span className="g-step__sr">Step {number}:</span> {title}
        </Heading>
      </div>
      <div className="g-step__body">{children}</div>
    </section>
  );
}

export interface FlowStepsProps {
  /** The step names in order: "Course", "Audience", ... */
  steps: readonly string[];
  /** Index of the step being worked on; earlier steps are done. */
  current: number;
  /** Accessible name of the list. Default: "Progress". */
  label?: string;
}

/**
 * A horizontal row of numbered steps: done steps show a tick, the current one is marked
 * `aria-current="step"`. On a narrow screen it collapses to "Step 2 of 4: Audience".
 */
export function FlowSteps({ steps, current, label = 'Progress' }: FlowStepsProps) {
  return (
    <nav aria-label={label} className="g-flow">
      <ol className="g-flow__list">
        {steps.map((name, i) => (
          <li
            key={name}
            className={cx('g-flow__step', i < current && 'is-done', i === current && 'is-current')}
            aria-current={i === current ? 'step' : undefined}
          >
            <span className="g-flow__badge" aria-hidden="true">
              {i < current ? <CheckIcon size={14} /> : i + 1}
            </span>
            <span className="g-flow__name">
              {name}
              {i < current ? <span className="g-step__sr"> (done)</span> : null}
            </span>
          </li>
        ))}
      </ol>
      <p className="g-flow__compact">
        Step {current + 1} of {steps.length}: {steps[current]}
      </p>
    </nav>
  );
}

export interface FlowPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** The way the person is moving: the panel slides in from that side. Default: `forward`. */
  direction?: 'forward' | 'back';
}

/** The body of one flow step. Give it a `key` per step so it slides in on every change. */
export function FlowPanel({ direction = 'forward', className, ...rest }: FlowPanelProps) {
  return <div className={cx('g-flow-panel', `g-flow-panel--${direction}`, className)} {...rest} />;
}

/** `<Stepper.Step number title>` is the same component as `StepCard`; `Stepper.Flow` is `FlowSteps`. */
export const Stepper = { Step: StepCard, Flow: FlowSteps };
