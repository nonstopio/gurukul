import { act, render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { App } from '../src/App';
import { appRoutes } from '../src/routes';
import type { ParikshaService } from '../src/pariksha/service';
import { NONSTOP, fakeAuth } from './fake-auth';
import { fakeData } from './fake-data';
import { fakePariksha } from './fake-pariksha';

/** Renders the whole app at `path`, signed in as a Shishya (or signed out). */
export async function openApp(
  path: string | { pathname: string; state: unknown },
  opts: {
    data?: ReturnType<typeof fakeData>;
    pariksha?: ParikshaService;
    signedIn?: boolean;
  } = {},
) {
  const f = fakeAuth();
  const data = opts.data ?? fakeData();
  const pariksha = opts.pariksha ?? fakePariksha();
  const router = createMemoryRouter(appRoutes(), { initialEntries: [path] });
  const view = render(
    <App service={f.service} data={data.data} pariksha={pariksha} router={router} />,
  );
  await act(async () => {
    f.emitUser(opts.signedIn === false ? null : NONSTOP);
    await Promise.resolve();
  });
  if (opts.signedIn !== false) {
    act(() => f.emitProfile({ roles: ['shishya'], displayName: 'P', team: null }));
  }
  return { ...view, router, data, pariksha };
}
