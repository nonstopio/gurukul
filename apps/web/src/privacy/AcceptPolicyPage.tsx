import { Button, Page, PageHeader } from '@gurukul/ui';
import { Link } from 'react-router';
import { useSession } from '../auth/AuthProvider';
import { acceptPolicy } from './policy';

/**
 * Shown in place of every page to a signed-in person who has not accepted the current policy:
 * someone signed in before it existed, or after it changed. Declining is signing out.
 */
export function AcceptPolicyPage() {
  const { signOut } = useSession();
  return (
    <main id="content">
      <Page width="reading">
        <PageHeader
          title="Before you continue"
          lead="Gurukul measures how it is used, to improve the courses. Read the privacy policy, then accept it to carry on."
        />
        <p>
          <Link to="/privacy">Read the privacy policy</Link>
        </p>
        <p>
          <Button variant="primary" onClick={acceptPolicy}>
            Accept and continue
          </Button>{' '}
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </p>
      </Page>
    </main>
  );
}
