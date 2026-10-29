import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';

export function NotAllowedPage() {
  const t = useTerms();
  return (
    <main className="notfound">
      <h1 className="notfound__title">You do not have access to this page.</h1>
      <p>
        Ask {article(t.Admin)} if you need it, or <a href="/">go to the start</a>.
      </p>
    </main>
  );
}
