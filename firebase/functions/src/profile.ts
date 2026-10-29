import { nameKey } from '@gurukul/schema';
import { log } from './logging/log.js';
import { isAllowedEmail } from './roles.js';

/** What the Auth `onCreate` trigger gives us about the new account. */
export interface NewUser {
  uid: string;
  email?: string | null;
  emailVerified?: boolean;
  displayName?: string | null;
  photoURL?: string | null;
}

export interface ProfileDoc {
  email: string;
  displayName: string;
  /** The display name lower-cased, for people search by name. */
  nameLower: string;
  photoURL: string | null;
  team: null;
  roles: ['shishya'];
  grantedCourseIds: [];
}

/** Where the profile and the invites live. Implemented over Firestore by `firestoreUserStore`. */
export interface UserStore {
  createProfile(uid: string, profile: ProfileDoc): Promise<void>;
  /** Stamps `uid` on every assignment for `email` that has none yet; returns how many. */
  claimAssignments(email: string, uid: string): Promise<number>;
}

/** The profile document for a new NonStop account. The display name falls back to the email's local part. */
export function buildProfile(user: NewUser & { email: string }): ProfileDoc {
  const email = user.email.toLowerCase();
  const displayName = user.displayName?.trim() || email.split('@')[0] || email;
  return {
    email,
    displayName,
    nameLower: nameKey(displayName),
    photoURL: user.photoURL ?? null,
    team: null,
    roles: ['shishya'],
    grantedCourseIds: [],
  };
}

/**
 * First sign-in: write `users/{uid}` and claim the assignments made to this email before the
 * account existed. A personal or unverified account gets nothing: rules would deny it everything
 * anyway, and a profile for it would be noise.
 */
export async function handleUserCreated(
  store: UserStore,
  user: NewUser,
): Promise<{ created: boolean; claimed: number }> {
  if (!user.email || user.emailVerified !== true || !isAllowedEmail(user.email)) {
    log.debug('Sign-up ignored', { uid: user.uid, reason: 'not a verified NonStop account' });
    return { created: false, claimed: 0 };
  }
  const profile = buildProfile({ ...user, email: user.email });
  await store.createProfile(user.uid, profile);
  const claimed = await store.claimAssignments(profile.email, user.uid);
  return { created: true, claimed };
}
