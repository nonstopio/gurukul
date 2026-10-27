/** Someone else saved the draft between your load and your save. Reload, then reapply. */
export class DraftConflictError extends Error {
  constructor() {
    super('The draft was changed by someone else.');
    this.name = 'DraftConflictError';
  }
}
