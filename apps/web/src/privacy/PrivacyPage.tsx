import { Card, Page, PageHeader } from '@gurukul/ui';
import { Link } from 'react-router';
import { POLICY_VERSION } from './policy';

/** The text people accept before they sign in. Change it only together with `POLICY_VERSION`. */
export function PrivacyPage() {
  return (
    // Public and outside the shell, like the verify page: anyone can read it before signing in.
    <main id="content">
      <Page width="reading">
        <PageHeader
          eyebrow="NonStop Academy"
          title="Privacy policy"
          lead={`How Gurukul measures its own use. Version ${POLICY_VERSION}.`}
        />
        <Card title="What we measure" titleAs="h2">
          <p>
            While you are signed in, Gurukul records how it is used with Google Analytics: which
            pages you open, and actions such as starting a course, finishing a lesson, submitting a
            Quiz (and whether you passed, with your score), opening a certificate, creating or
            publishing a course, assigning a course, and errors you run into.
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
