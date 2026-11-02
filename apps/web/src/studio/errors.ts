/** Someone else saved the draft between your load and your save. Reload, then reapply. */
export class DraftConflictError extends Error {
  constructor() {
    super('The draft was changed by someone else.');
    this.name = 'DraftConflictError';
  }
}

/** The Educator pressed Cancel: an upload that stopped on purpose, not a failure. */
export class UploadCancelledError extends Error {
  constructor() {
    super('The upload was cancelled.');
    this.name = 'UploadCancelledError';
  }
}
