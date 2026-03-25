/**
 * Wraps @inquirer/prompts to add Escape-to-go-back support.
 *
 * - Escape key → throws GoBackError (wizard catches this to go back one step)
 * - Ctrl+C → process.exit(0) (standard quit behavior)
 *
 * Uses AbortController to cancel the active prompt when Escape is pressed.
 */

import { select as _select, input as _input, confirm as _confirm, checkbox as _checkbox } from '@inquirer/prompts';

/** Thrown when the user presses Escape — the wizard loop catches this to go back */
export class GoBackError extends Error {
  name = 'GoBackError';
  constructor() { super('User pressed Escape'); }
}

type PromptFn<TArgs extends any[], TResult> = (...args: TArgs) => Promise<TResult>;

/**
 * Wrap a prompt function to handle Escape (go back) and Ctrl+C (quit).
 * Listens for raw keypress events on stdin.
 */
function wrapPrompt<TArgs extends any[], TResult>(fn: PromptFn<TArgs, TResult>): PromptFn<TArgs, TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const ac = new AbortController();

    // Inject the abort signal into the prompt's config
    // @inquirer/prompts accept { signal } as the second argument
    const lastArg = args.length > 1 ? args[args.length - 1] : undefined;
    if (typeof lastArg === 'object' && lastArg !== null && !Array.isArray(lastArg)) {
      (lastArg as any).signal = ac.signal;
    } else {
      args.push({ signal: ac.signal } as any);
    }

    // Listen for raw escape key
    const wasRaw = process.stdin.isRaw;
    let escapeListener: ((data: Buffer) => void) | null = null;

    if (process.stdin.isTTY) {
      escapeListener = (data: Buffer) => {
        // Escape key = 0x1b (27) as a single byte
        if (data.length === 1 && data[0] === 0x1b) {
          ac.abort();
        }
      };
      process.stdin.on('data', escapeListener);
    }

    const cleanup = () => {
      if (escapeListener) {
        process.stdin.removeListener('data', escapeListener);
      }
    };

    try {
      const result = await fn(...args);
      cleanup();
      return result;
    } catch (err: any) {
      cleanup();

      // AbortPromptError = Escape was pressed → go back
      if (err.name === 'AbortPromptError') {
        throw new GoBackError();
      }

      // ExitPromptError = Ctrl+C → quit the program
      if (err.name === 'ExitPromptError') {
        console.log('\n');
        process.exit(0);
      }

      throw err;
    }
  };
}

export const select = wrapPrompt(_select);
export const input = wrapPrompt(_input);
export const confirm = wrapPrompt(_confirm);
export const checkbox = wrapPrompt(_checkbox);
