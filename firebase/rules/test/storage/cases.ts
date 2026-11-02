import { randomUUID } from 'node:crypto';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, updateMetadata, uploadBytes } from 'firebase/storage';

// Every case is one request against storage.rules and the answer the rules must give. storage.test.ts
// runs them as tests; storage-coverage.test.ts runs them again against rules with one condition
// forced the wrong way, to prove each condition is decided by some case.

export type Op = 'read' | 'create' | 'update' | 'delete';
export type Who =
  | 'signedOut'
  | 'admin'
  | 'asha' // Educator on c1
  | 'rohan' // Educator on c2
  | 'priya' // a Learner whose uid is in c1's educatorIds
  | 'mixedCase' // an Educator on c1 whose email domain is upper-cased
  | 'gmail'
  | 'unverified'
  | 'password';

/** `config/org.uploads`: absent (no field), missing (no document), or the stored limits. */
export type Org = 'absent' | 'missing' | Record<string, number>;

export interface Case {
  name: string;
  expect: 'allow' | 'deny';
  who: Who;
  op: Op;
  type?: string;
  bytes?: number;
  /** Where the object is, `{id}` standing for a name made fresh for each run (the emulator's storage is not cleared between cases). */
  /** Where the object is; `{id}` stands for a name made fresh for each run, as the emulator's storage is not cleared between cases. */
  path?: string;
  /** An object already stored at `path` (reads, updates, deletes and overwrites need one). */
  exists?: boolean;
  org?: Org;
}

const KB = 1024;
const MEDIA = 'courses/c1/media/';

const token = (uid: string, over: Record<string, unknown> = {}) => ({
  email: `${uid}@nonstopio.com`,
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
  ...over,
});

const WHO: Record<Exclude<Who, 'signedOut'>, [string, Record<string, unknown>]> = {
  admin: ['ajay', token('ajay', { admin: true })],
  asha: ['asha', token('asha', { educator: true })],
  rohan: ['rohan', token('rohan', { educator: true })],
  priya: ['priya', token('priya')],
  mixedCase: ['asha', token('asha', { educator: true, email: 'Asha@NonStopIO.com' })],
  gmail: ['asha', token('asha', { educator: true, admin: true, email: 'asha@gmail.com' })],
  unverified: ['asha', token('asha', { educator: true, admin: true, email_verified: false })],
  password: [
    'asha',
    token('asha', { educator: true, admin: true, firebase: { sign_in_provider: 'password' } }),
  ],
};

/** Makes the case's data and returns the path its request is made on. */
export async function seed(env: RulesTestEnvironment, c: Case): Promise<string> {
  const path = (c.path ?? `${MEDIA}{id}.png`).replace('{id}', randomUUID());
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'courses/c1'), { educatorIds: ['asha', 'priya'] });
    await setDoc(doc(db, 'courses/c2'), { educatorIds: ['rohan'] });
    const org = c.org ?? 'absent';
    if (org === 'missing') {
      await deleteDoc(doc(db, 'config/org'));
      return;
    }
    const base = { domain: 'nonstopio.com', teams: [] };
    await setDoc(doc(db, 'config/org'), org === 'absent' ? base : { ...base, uploads: org });
  });
  if (c.exists) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), path), new Uint8Array(4), {
        contentType: 'image/png',
      });
    });
  }
  return path;
}

function request(env: RulesTestEnvironment, c: Case, path: string): Promise<unknown> {
  const ctx =
    c.who === 'signedOut'
      ? env.unauthenticatedContext()
      : env.authenticatedContext(WHO[c.who][0], WHO[c.who][1]);
  const file = ref(ctx.storage(), path);
  switch (c.op) {
    case 'read':
      return getBytes(file);
    case 'create':
      return uploadBytes(file, new Uint8Array(c.bytes ?? 1000), {
        contentType: c.type ?? 'image/png',
      });
    case 'update':
      return updateMetadata(file, { cacheControl: 'no-cache' });
    case 'delete':
      return deleteObject(file);
  }
}

/** Runs the case against the loaded rules and says whether they gave the answer it expects. */
export async function matches(env: RulesTestEnvironment, c: Case): Promise<boolean> {
  const path = await seed(env, c);
  try {
    await (c.expect === 'allow'
      ? assertSucceeds(request(env, c, path) as Promise<void>)
      : assertFails(request(env, c, path) as Promise<void>));
    return true;
  } catch {
    return false;
  }
}

/** Runs the case and throws, with the emulator's own message, when the rules disagree. */
export async function run(env: RulesTestEnvironment, c: Case) {
  const path = await seed(env, c);
  await (c.expect === 'allow'
    ? assertSucceeds(request(env, c, path) as Promise<void>)
    : assertFails(request(env, c, path) as Promise<void>));
}

const allow = (name: string, c: Omit<Case, 'name' | 'expect'>): Case => ({
  name,
  expect: 'allow',
  ...c,
});
const deny = (name: string, c: Omit<Case, 'name' | 'expect'>): Case => ({
  name,
  expect: 'deny',
  ...c,
});
const upload = (who: Who, over: Partial<Case> = {}) => ({ who, op: 'create' as const, ...over });

const TYPES: Array<[string, string]> = [
  ['image/webp', 'webp'],
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpeg', 'jpeg'],
  ['application/pdf', 'pdf'],
];

export const CASES: Case[] = [
  // Reading
  allow('an Educator reads a file', { who: 'asha', op: 'read', exists: true }),
  allow('any signed-in NonStop account reads a file', { who: 'priya', op: 'read', exists: true }),
  deny('signed out cannot read a file', { who: 'signedOut', op: 'read', exists: true }),
  deny('a personal Gmail account cannot read a file', { who: 'gmail', op: 'read', exists: true }),
  deny('an unverified email cannot read a file', { who: 'unverified', op: 'read', exists: true }),
  deny('an email and password account cannot read a file', {
    who: 'password',
    op: 'read',
    exists: true,
  }),
  deny('a file outside media/ cannot be read', {
    who: 'admin',
    op: 'read',
    path: 'courses/c1/private/{id}.png',
    exists: true,
  }),
  deny('a file outside courses/ cannot be read', {
    who: 'admin',
    op: 'read',
    path: 'other/{id}.png',
    exists: true,
  }),

  // Who may create
  allow('an Educator on the course uploads', upload('asha')),
  allow('an Admin uploads to any course', upload('admin', { path: 'courses/c2/media/{id}.png' })),
  allow('the domain is compared lower-cased', upload('mixedCase')),
  deny('a Learner listed on the course cannot upload', upload('priya')),
  deny('an Educator not on the course cannot upload', upload('rohan')),
  deny('an Educator cannot upload to a course that does not exist', {
    ...upload('asha'),
    path: 'courses/c3/media/{id}.png',
  }),
  deny('signed out cannot upload', upload('signedOut')),
  deny('a personal Gmail account cannot upload, whatever its claims', upload('gmail')),
  deny('an unverified email cannot upload, whatever its claims', upload('unverified')),
  deny('an email and password account cannot upload, whatever its claims', upload('password')),

  // Types and extensions
  ...TYPES.map(([type, ext]) =>
    allow(
      `${type} named .${ext} is accepted`,
      upload('asha', { type, path: `${MEDIA}{id}.${ext}` }),
    ),
  ),
  ...(<Array<[string, string]>>[
    ['image/svg+xml', 'svg'],
    ['image/gif', 'gif'],
    ['image/avif', 'avif'],
    ['text/html', 'html'],
    ['application/zip', 'zip'],
    ['application/octet-stream', 'png'],
  ]).map(([type, ext]) =>
    deny(`${type} named .${ext} is refused`, upload('asha', { type, path: `${MEDIA}{id}.${ext}` })),
  ),
  ...(<Array<[string, string]>>[
    ['image/webp', 'png'],
    ['image/png', 'pdf'],
    ['image/jpeg', 'webp'],
    ['application/pdf', 'jpg'],
    ['image/png', 'jpg'],
    ['image/jpeg', 'png'],
  ]).map(([type, ext]) =>
    deny(
      `${type} named .${ext} is refused: the extension must match`,
      upload('asha', { type, path: `${MEDIA}{id}.${ext}` }),
    ),
  ),
  deny('a file with no extension is refused', upload('asha', { path: `${MEDIA}{id}` })),

  // Size, with the default limits (500 KB an image, 1 MB a PDF) and no org document or field
  allow('an image of exactly 500 KB is accepted', upload('asha', { bytes: 500 * KB })),
  deny('an image one byte over 500 KB is refused', upload('asha', { bytes: 500 * KB + 1 })),
  allow(
    'a PDF of exactly 1 MB is accepted',
    upload('asha', { type: 'application/pdf', path: `${MEDIA}{id}.pdf`, bytes: 1024 * KB }),
  ),
  deny(
    'a PDF one byte over 1 MB is refused',
    upload('asha', { type: 'application/pdf', path: `${MEDIA}{id}.pdf`, bytes: 1024 * KB + 1 }),
  ),
  allow(
    'with no config/org document the defaults apply: an image of 500 KB',
    upload('asha', { org: 'missing', bytes: 500 * KB }),
  ),
  deny(
    'with no config/org document the defaults apply: an image one byte over',
    upload('asha', { org: 'missing', bytes: 500 * KB + 1 }),
  ),

  // An Admin's lower limits (config/org.uploads)
  allow(
    'a lowered image limit: exactly the limit',
    upload('asha', {
      org: { imageMaxKB: 200, pdfMaxKB: 100 },
      bytes: 200 * KB,
    }),
  ),
  deny(
    'a lowered image limit: one byte over',
    upload('asha', {
      org: { imageMaxKB: 200, pdfMaxKB: 100 },
      bytes: 200 * KB + 1,
    }),
  ),
  allow(
    'a lowered PDF limit: exactly the limit',
    upload('asha', {
      org: { imageMaxKB: 200, pdfMaxKB: 100 },
      type: 'application/pdf',
      path: `${MEDIA}{id}.pdf`,
      bytes: 100 * KB,
    }),
  ),
  deny(
    'a lowered PDF limit: one byte over',
    upload('asha', {
      org: { imageMaxKB: 200, pdfMaxKB: 100 },
      type: 'application/pdf',
      path: `${MEDIA}{id}.pdf`,
      bytes: 100 * KB + 1,
    }),
  ),
  allow(
    'an image limit raised to 1 MB: exactly 1 MB',
    upload('asha', {
      org: { imageMaxKB: 1024, pdfMaxKB: 1024 },
      bytes: 1024 * KB,
    }),
  ),
  deny(
    'an image limit raised to 1 MB: one byte over',
    upload('asha', {
      org: { imageMaxKB: 1024, pdfMaxKB: 1024 },
      bytes: 1024 * KB + 1,
    }),
  ),

  // The hard ceiling holds even when a stored limit is above it (the Firestore rule refuses to store one)
  allow(
    'a stored image limit above the ceiling: exactly 1 MB still passes',
    upload('asha', {
      org: { imageMaxKB: 4096, pdfMaxKB: 4096 },
      bytes: 1024 * KB,
    }),
  ),
  deny(
    'a stored image limit above the ceiling: one byte over 1 MB is refused',
    upload('asha', {
      org: { imageMaxKB: 4096, pdfMaxKB: 4096 },
      bytes: 1024 * KB + 1,
    }),
  ),
  deny(
    'a stored PDF limit above the ceiling: one byte over 1 MB is refused',
    upload('asha', {
      org: { imageMaxKB: 4096, pdfMaxKB: 4096 },
      type: 'application/pdf',
      path: `${MEDIA}{id}.pdf`,
      bytes: 1024 * KB + 1,
    }),
  ),
  allow(
    'a stored limit for images only leaves the PDF at its default',
    upload('asha', {
      org: { imageMaxKB: 100 },
      type: 'application/pdf',
      path: `${MEDIA}{id}.pdf`,
      bytes: 1024 * KB,
    }),
  ),
  deny(
    'a stored limit for PDFs only leaves images at their default',
    upload('asha', {
      org: { pdfMaxKB: 100 },
      bytes: 500 * KB + 1,
    }),
  ),
  allow(
    'a stored limit for PDFs only leaves images at their default: 500 KB',
    upload('asha', {
      org: { pdfMaxKB: 100 },
      bytes: 500 * KB,
    }),
  ),

  // Never overwritten, updated or deleted by a client
  deny('an Educator cannot overwrite a file', upload('asha', { exists: true })),
  deny('an Admin cannot overwrite a file', upload('admin', { exists: true })),
  deny('an Educator cannot update a file', { who: 'asha', op: 'update', exists: true }),
  deny('an Admin cannot update a file', { who: 'admin', op: 'update', exists: true }),
  deny('an Educator cannot delete a file', { who: 'asha', op: 'delete', exists: true }),
  deny('an Admin cannot delete a file', { who: 'admin', op: 'delete', exists: true }),

  // Default deny outside courses/{courseId}/media/{file}
  ...[
    'courses/c1/{id}.png',
    'courses/c1/drafts/{id}.png',
    'courses/c1/media/nested/{id}.png',
    'other/{id}.png',
    '{id}.png',
  ].map((path) =>
    deny(`an Admin cannot upload to ${path.replace('{id}', 'x')}`, upload('admin', { path })),
  ),
];
