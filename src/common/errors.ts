/**
 * Platform challenge (checkpoint, suspicious-activity interstitial, CAPTCHA).
 * Policy: stop the whole run immediately, never retry through it.
 */
export class PlatformChallengeError extends Error {
  constructor(
    public readonly platform: string,
    message: string,
    public readonly evidenceScreenshot: string | null = null,
  ) {
    super(message);
    this.name = 'PlatformChallengeError';
  }
}

/** Session expired / forced logout / permissions failure. Stop and re-login manually. */
export class FatalAuthError extends Error {
  constructor(public readonly platform: string, message: string) {
    super(message);
    this.name = 'FatalAuthError';
  }
}

/** True when the error must abort the entire run rather than fail one row. */
export function isRunStopper(err: unknown): err is PlatformChallengeError | FatalAuthError {
  return err instanceof PlatformChallengeError || err instanceof FatalAuthError;
}
