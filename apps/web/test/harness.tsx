import type { LabelSet } from '@gurukul/schema';
import { act, render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { App } from '../src/App';
import { appRoutes } from '../src/routes';
import type { AuthUser } from '../src/auth/service';
import type { QuizService } from '../src/quiz/service';
import { NONSTOP, fakeAuth } from './fake-auth';
import { fakeConsole } from './fake-console';
import { fakeData } from './fake-data';
import { fakeStudio } from './fake-studio';
import { fakeQuiz } from './fake-quiz';

/** Renders the whole app at `path`, signed in as a Learner (or signed out). */
export async function openApp(
  path: string | { pathname: string; state: unknown },
  opts: {
    data?: ReturnType<typeof fakeData>;
    quiz?: QuizService;
    console?: ReturnType<typeof fakeConsole>;
    studio?: ReturnType<typeof fakeStudio>;
    signedIn?: boolean;
    roles?: Array<'educator' | 'admin'>;
    /** The person's label set; `null` for someone who has not picked one yet. */
    labels?: LabelSet | null;
    /** Overrides on the signed-in Google user (a missing display name, say). */
    user?: Partial<AuthUser>;
    /** `teamId` of each team the person is on; none by default. */
    teamIds?: string[];
  } = {},
) {
  const claims = Object.fromEntries((opts.roles ?? []).map((r) => [r, true]));
  const f = fakeAuth(claims);
  const consoleApi = opts.console ?? fakeConsole();
  const data = opts.data ?? fakeData();
  const quiz = opts.quiz ?? fakeQuiz();
  const router = createMemoryRouter(appRoutes(), { initialEntries: [path] });
  const view = render(
    <App
      service={f.service}
      data={data.data}
      quiz={quiz}
      console={consoleApi}
      studio={opts.studio ?? fakeStudio()}
      router={router}
    />,
  );
  await act(async () => {
    f.emitUser(opts.signedIn === false ? null : { ...NONSTOP, ...opts.user });
    await Promise.resolve();
  });
  if (opts.signedIn !== false) {
    act(() =>
      f.emitProfile({
        roles: ['learner', ...(opts.roles ?? [])],
        displayName: 'P',
        team: null,
        teamIds: opts.teamIds ?? [],
        labels: opts.labels === null ? undefined : (opts.labels ?? 'generic'),
      }),
    );
  }
  return { ...view, router, data, quiz, console: consoleApi, studio: opts.studio, auth: f };
}
