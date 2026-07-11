/**
 * Minimal typing for the View Transitions API, which the dark-mode clip-path reveal uses. TypeScript's
 * DOM lib does not ship this yet, so we augment `Document` here rather than reach for `any` (the repo
 * bans it). Only the members the toggle touches are declared.
 */
interface ViewTransition {
  readonly ready: Promise<void>;
  readonly finished: Promise<void>;
  readonly updateCallbackDone: Promise<void>;
  skipTransition(): void;
}

interface Document {
  startViewTransition?(callback: () => void | Promise<void>): ViewTransition;
}
