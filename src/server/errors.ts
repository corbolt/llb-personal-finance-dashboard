import type { ErrorKey } from "../i18n/messages/types";

/**
 * A failure the user can do something about.
 *
 * It names its message by catalog key (`error.*` in `src/i18n/messages`)
 * instead of carrying text: this layer speaks no language, and the interface
 * words the message in whichever one it is showing. `message` holds the key,
 * which is what logs and tests see.
 */
export class UserFacingError extends Error {
  constructor(
    readonly key: ErrorKey,
    /** Values for the placeholders in the message. */
    readonly params?: Record<string, string | number>,
  ) {
    super(key);
    this.name = "UserFacingError";
  }
}
