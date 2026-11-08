// Ошибка API: код из протокола (src/state/protocol.ts, `ERRORS`) и поля ответа.
import type { ErrorCode } from '../../src/state/protocol';

export class ApiError extends Error {
  constructor(readonly code: ErrorCode, readonly extra: Record<string, unknown> = {}) { super(code); }
}
