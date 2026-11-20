/**
 * Every analytics event the app sends, and the parameters each takes. The single source of truth:
 * `analytics.track('x', { ... })` is a compile error for an event not listed here, a missing
 * parameter or an extra one. GA4 recommended events are used where one fits; the rest are custom.
 *
 * Parameters are small, non-personal facts: ids and counts, never names, emails or free text.
 * Custom parameters only appear in GA4 reports after they are registered as custom dimensions
 * (docs/analytics.md). To add an event, follow "Adding an event" there.
 */
export interface AnalyticsEvents {
  /** A person finished signing in to Gurukul with Google (once per sign-in, not per page load). */
  login: { method: 'google' };
  /** A person's first ever sign-in, sent with `login`. */
  sign_up: { method: 'google' };
  /** A person chose Sign out. Followed by `analytics.reset()`. */
  logout: Record<string, never>;
  /** A person picked a result in global search (⌘K). The query itself is never sent. */
  search: { query_length: number; result_count: number; result_type: string };
  /** A person used a primary action or navigation link. `content_id` names which one. */
  select_content: { content_type: 'cta' | 'nav'; content_id: string };
  /** A learner opened a course for the first time. */
  course_start: { course_id: string };
  /** A learner finished a lesson. */
  lesson_complete: { course_id: string; lesson_id: string };
  /** A learner finished every required item in a course. */
  course_complete: { course_id: string };
  /** A learner submitted a Quiz and got a result. */
  quiz_submit: { course_id: string; quiz_id: string; passed: boolean; score_percent: number };
  /** A learner opened one of their certificates. */
  certificate_view: { certificate_id: string };
  /** A learner downloaded or printed a certificate. */
  certificate_download: { certificate_id: string };
  /** An Educator created a course in the Studio. */
  course_create: { course_id: string };
  /** An Educator published a course version. */
  course_publish: { course_id: string };
  /** An Admin assigned a course. `assignee_count` is how many people or teams. */
  course_assign: { course_id: string; assignee_count: number };
  /** Something failed and was caught: an API call or a screen that crashed. */
  app_error: { source: 'api' | 'route'; code: string };
  /**
   * An Educator started a Gurukul Studio session in the desktop app (`SessionLauncher`): a new
   * course, or an edit of one. Not sent when an open session is opened again.
   */
  session_started: { kind: SessionKind };
  /**
   * A session's working copy was written to the draft (`SaveBar`). `kind` is `new` when the course
   * was created for this save. How many changes and turns, in bands only.
   */
  session_saved: { kind: SessionKind; change_band: CountBand; turn_band: CountBand };
  /** An Educator discarded a session, leaving the draft untouched. Bands only, as for a save. */
  session_discarded: { kind: SessionKind; change_band: CountBand; turn_band: CountBand };
}

/** A Gurukul Studio session builds a new course or edits one. */
export type SessionKind = 'new' | 'edit';

/**
 * A count in a band (`countBand`, `studio/session/events.ts`): enough to see how big sessions are,
 * without exact numbers that, with a time and a role, could point at one person's work.
 */
export type CountBand = '0' | '1-5' | '6-20' | '21-50' | '51+';

export type EventName = keyof AnalyticsEvents;

/** `track(name)` for an event with no parameters, `track(name, params)` for the rest. */
export type TrackArgs<E extends EventName> =
  AnalyticsEvents[E] extends Record<string, never> ? [] : [params: AnalyticsEvents[E]];

/** What a `page_view` carries. Sent by the router component, never by hand. */
export interface PageViewParams {
  page_path: string;
  page_title: string;
  page_location: string;
}
