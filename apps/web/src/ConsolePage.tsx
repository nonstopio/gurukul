/** Kulapati console landing. The learners table and assign flow arrive with M4. */
export function ConsolePage() {
  return (
    <main className="page">
      <h1 className="page__title">Kulapati console</h1>
      <section className="page__empty" aria-labelledby="console-empty">
        <h2 id="console-empty">Learners and assignments</h2>
        <p>Assigning courses and managing roles arrives next.</p>
      </section>
    </main>
  );
}

/** Vyasa Studio landing. The course editor arrives with M5. */
export function StudioPage() {
  return (
    <main className="page">
      <h1 className="page__title">Vyasa Studio</h1>
      <section className="page__empty" aria-labelledby="studio-empty">
        <h2 id="studio-empty">Your courses</h2>
        <p>Building and publishing courses arrives soon.</p>
      </section>
    </main>
  );
}
