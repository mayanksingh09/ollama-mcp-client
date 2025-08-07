/**
 * EventSource type definitions for Node.js
 */

declare module 'eventsource' {
  export interface EventSourceInit {
    headers?: Record<string, string>;
    withCredentials?: boolean;
    https?: {
      rejectUnauthorized?: boolean;
    };
  }

  export class EventSource {
    static readonly CONNECTING: number;
    static readonly OPEN: number;
    static readonly CLOSED: number;

    readonly readyState: number;
    readonly url: string;

    onopen: ((event: Event) => void) | null;
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: ((event: Event) => void) | null;

    constructor(url: string, eventSourceInitDict?: EventSourceInit);
    close(): void;
  }

  export interface MessageEvent {
    data: string;
    origin: string;
    lastEventId: string;
  }
}
