import { Card, Page, PageHeader } from '@gurukul/ui';
import { Link } from 'react-router';
import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { POLICY_VERSION } from './policy';

/** The text people accept before they sign in. Change it only together with `POLICY_VERSION`. */
export function PrivacyPage() {
  const t = useTerms();
  return (
    // Public and outside the shell, like the verify page: anyone can read it before signing in.
    <main id="content">
      <Page width="reading">
        <PageHeader
          eyebrow="NonStop Gurukul"
          title="Privacy policy"
          lead={`How Gurukul measures its own use. Version ${POLICY_VERSION}.`}
        />
        <Card title="What we measure" titleAs="h2">
          <p>
            While you are signed in, Gurukul records how it is used with Google Analytics: which
            pages you open, and actions such as starting a course, finishing a lesson, submitting a
            Quiz (and whether you passed, with your score), opening a certificate, creating or
            publishing a course, assigning a course, starting, saving or discarding a Gurukul Studio
            session (whether it was a new course, and roughly how many changes and turns it had,
            such as “6-20”), and errors you run into.
          </p>
          <p>
            Each record carries a random user id, your role (Learner, Educator or Admin), the app
            version and the kind of page. Nothing is collected before you sign in.
          </p>
        </Card>
        <Card title="What we never send" titleAs="h2">
          <p>
            Your name, your email, what you type in search, your Quiz answers, or the content of
            anything you write. Records that look like an email address or a phone number are
            removed before they leave your browser.
          </p>
        </Card>
        <Card title="Gurukul Studio sessions" titleAs="h2">
          <p>
            {`In the Gurukul Studio desktop app, ${article(t.Educator)} can build or change a course by chatting with an AI agent. The agent is Claude Code, Anthropic’s program, running on the ${t.Educator}’s own computer under their own Claude account. Gurukul Studio never asks for, sees or keeps a Claude sign-in.`}
          </p>
          <p>
            <strong>{`Sent to Anthropic, under the ${t.Educator}’s own account:`}</strong>
            {` the parts of the course the session works on, with their ${t.Quiz} answer keys; the messages the ${t.Educator} writes and the parts of the course they attach; and the files in the session’s Sources folder that the agent reads. The second opinion on ${t.Quiz} answers is a separate run that gets a question and the ${t.lessons} around it, never the answer key. No ${t.learner} data is sent: the agent has no way to read progress, ${t.Quiz} attempts, ${t.certificates} or anyone’s profile. Anthropic handles what it receives under the terms of the ${t.Educator}’s Claude plan.`}
          </p>
          <p>
            <strong>{`Kept on the ${t.Educator}’s computer:`}</strong> the session’s copy of the
            course, the chat and a copy after each turn, and Claude Code’s own record of the chat.
            They are removed 30 days after the session is saved; only its title, summary and counts
            stay, on that computer.
          </p>
          <p>
            <strong>Stored by Gurukul:</strong>
            {` nothing until the ${t.Educator} chooses Save to draft. Then the course’s draft is saved, exactly as when it is edited in the browser, and the session is measured as above. The chat and the Sources files never reach Gurukul.`}
          </p>
        </Card>
        <Card title="Why, and who sees it" titleAs="h2">
          <p>
            To see which courses help, where people get stuck and what to build next. The reports
            are read by the people who run Gurukul at NonStop io. Google processes the records for
            us under its Analytics terms.
          </p>
        </Card>
        <Card title="Your choice" titleAs="h2">
          <p>
            Accepting is required to use Gurukul, because measurement is how we improve it. If you
            do not accept, you stay signed out and nothing is sent. Questions, or a wish to have
            your records removed: <a href="mailto:gurukul@nonstopio.com">gurukul@nonstopio.com</a>.
          </p>
        </Card>
        <p>
          <Link to="/">Back to Gurukul</Link>
        </p>
      </Page>
    </main>
  );
}
