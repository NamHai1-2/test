import { MESSAGES, isMsgCode } from './messages';

/**
 * Error thrown by every api-client function for a non-2xx answer (CR-06 body `{ code, message }`).
 * `message` is the text the server sent, with its {placeholders} already filled in.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  /** Unix seconds of the server clock. Only present on MSG17. */
  readonly serverTime?: number;

  constructor(code: string, status: number, message?: string, serverTime?: number) {
    super(message ?? (isMsgCode(code) ? MESSAGES[code] : MESSAGES.MSG23));
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.serverTime = serverTime;
  }
}
