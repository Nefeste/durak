// из nardy: src/state/invite.ts @ 1d2bdff — ссылка приглашения за стол `https://<сервер>/t/<код>`
// открывает игру прямо на входе за стол (App Link).
import { isCode } from './protocol';

export function inviteCode(url: string | null | undefined): string | null {
  const m = url?.match(/^https?:\/\/[^/]+\/t\/([A-Za-z0-9]{6})(?:[/?#]|$)/);
  const code = m?.[1].toUpperCase() ?? null;
  return code && isCode(code) ? code : null;
}
