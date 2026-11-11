import { toast } from 'sonner';
import { ApiError } from './api-error';
import { MESSAGES, formatMessage, type MsgCode } from './messages';

type Params = Readonly<Record<string, string | number>>;

/** Text for an error: the server's own message, or MSG23 for anything that is not an ApiError. */
export function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : MESSAGES.MSG23;
}

export function notifyError(error: unknown): void {
  toast.error(errorText(error));
}

/** Success toast with the SRS text of `code` (MSG03, MSG13, MSG29, MSG30 ...). */
export function notifySuccess(code: MsgCode, params?: Params): void {
  toast.success(formatMessage(code, params));
}

/** Warning toast (for example MSG14, "Merchant has been suspended."). */
export function notifyWarning(code: MsgCode, params?: Params): void {
  toast.warning(formatMessage(code, params));
}
