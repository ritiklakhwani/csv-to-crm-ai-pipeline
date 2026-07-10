import type { SseEvent } from '@groweasy/shared';

/**
 * Reads Server-Sent Events from a POST response body.
 *
 * The browser's built-in EventSource only issues GET requests, and the process endpoint is a POST,
 * so we read the response body as a stream and parse the frames by hand. The two things that make
 * this correct rather than naive: frames are split on the blank line "\n\n", and a frame that
 * straddles two network chunks is held in the buffer until the rest of it arrives.
 *
 * Each `data:` payload is a complete SseEvent object (the server stringifies the whole event), so
 * the `event:` line is redundant and we switch on the parsed `type` instead.
 */
export async function* readSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let separator = buffer.indexOf('\n\n');
      while (separator !== -1) {
        const frame = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);

        const event = parseFrame(frame);
        if (event) yield event;

        separator = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Returns the SseEvent carried by a frame, or null for a heartbeat / comment / malformed frame. */
export function parseFrame(frame: string): SseEvent | null {
  const dataLines: string[] = [];

  for (const rawLine of frame.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    // A line beginning with ":" is a comment. The server sends ": ping" as a keep-alive.
    if (line.startsWith(':')) continue;
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }

  if (dataLines.length === 0) return null;

  try {
    return JSON.parse(dataLines.join('\n')) as SseEvent;
  } catch {
    return null;
  }
}
