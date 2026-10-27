import { useId } from 'react';
import type { ReactNode } from 'react';
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

/** `<Stepper.Step number title>` is the same component as `StepCard`. */
export const Stepper = { Step: StepCard };
