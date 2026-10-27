import { useSession } from './auth/AuthProvider';

/** Learner Home. Empty until courses are assigned or published (M2 fills it). */
export function HomePage() {
  const { user } = useSession();
  const name = user?.displayName?.split(' ')[0] ?? 'there';
  return (
    <main className="page">
      <h1 className="page__title">Welcome, {name}.</h1>
      <section className="page__empty" aria-labelledby="home-empty">
        <h2 id="home-empty">Nothing to learn yet</h2>
        <p>Courses assigned to you will appear here.</p>
      </section>
    </main>
  );
}
