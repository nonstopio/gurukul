import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-27',
  id: 'M3-QUIZ-CERTIFICATES',
  title: 'Take Quizzes, see how you did, and earn a certificate anyone can verify',
  area: 'QUIZ',
  kind: 'feature',
  why:
    'A course should prove something. Quizzes check what you learned, scored on the server so ' +
    'nobody can read the answers out of the page, and finishing a course now gives you a ' +
    'certificate that an employer or colleague can check with one link.',
  detail: [
    'One question per screen, with feedback after each answer when the Quiz allows it, and the keys 1–4 or A–D to choose.',
    'The result shows your score, what to revisit, and when a retake opens; the best score counts and passing unlocks the next chapter.',
    'Finishing every lesson and passing every Quiz issues a certificate: view it, print it as a PDF, add it to LinkedIn or copy its verify link.',
    'Anyone can open a verify link without signing in; it shows the name, course and date, and whether the certificate is still valid. An Admin can revoke one.',
  ],
} satisfies ChangelogEntry;
