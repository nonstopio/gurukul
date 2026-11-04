import { buttonClass, GitHubIcon } from '@gurukul/ui';
import { issueUrl, type Problem } from './report';

/** "Report issue" beside a failure: opens a prefilled GitHub bug in a new tab (`report.ts`). */
export function ReportIssueLink({ problem }: { problem: Problem }) {
  return (
    <a
      className={buttonClass('secondary')}
      href={issueUrl(problem)}
      target="_blank"
      rel="noreferrer"
    >
      <span className="g-btn__icon" aria-hidden="true">
        <GitHubIcon />
      </span>
      Report issue
    </a>
  );
}
