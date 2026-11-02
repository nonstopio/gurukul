/**
 * What an Educator reads when an upload fails, from the Storage error's `code`: said in terms of
 * what to do next. Nothing from the error's own text is shown (it can name internal paths).
 */
export function uploadFailureMessage(error: unknown, online: boolean = navigator.onLine): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (
    !online ||
    code === 'storage/retry-limit-exceeded' ||
    code === 'storage/network-request-failed'
  ) {
    return 'The upload could not reach Gurukul. Check your connection, then try again.';
  }
  if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
    return 'Gurukul refused this upload. You may not be an Educator of this course, or the file is larger than the limit the server allows. Check both, then try again.';
  }
  if (code === 'storage/quota-exceeded') {
    return 'Gurukul has no storage space left for new files. Tell an Admin, then try again later.';
  }
  return 'The upload did not finish, and nothing was saved. Try again.';
}

/** The page in the Educator guide that explains shrinking an image by hand. */
export const SHRINK_GUIDE_URL =
  'https://github.com/nonstopio/gurukul/blob/main/docs/educator.md#shrink-an-image-by-hand';
