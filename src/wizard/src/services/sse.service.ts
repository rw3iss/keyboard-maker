import type { BuildEvent } from '../types/events.types';

export function connectSSE(
  url: string,
  handlers: {
    onEvent: (event: BuildEvent) => void;
    onError?: (err: Event) => void;
    onClose?: () => void;
  }
): () => void {
  const es = new EventSource(url);

  es.onmessage = (e) => {
    handlers.onEvent(JSON.parse(e.data));
  };

  es.onerror = (e) => {
    handlers.onError?.(e);
  };

  return () => {
    es.close();
    handlers.onClose?.();
  };
}
