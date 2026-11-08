// Телефонная часть онлайна против настоящего сервера под Bun: `Net` (ключ, ник, вход по коду в два
// шага), `OnlineTable` (опрос, действия, `stale`), проверка колоды после партии и её провал на
// подменённом доказательстве. Плюс ссылка приглашения и цвет ошибки на тёмном столе.
import { afterAll, describe, expect, test } from 'bun:test';
import { chooseAction, legalFor, makeRng } from '../../src/bot';
import { Net, hex16 } from '../../src/state/net';
import type { Device } from '../../src/state/net';
import { OnlineTable } from '../../src/state/online';
import { verifyGame } from '../../src/state/verify';
import { inviteCode } from '../../src/state/invite';
import { C } from '../../src/ui/theme';
import { createApp } from '../../server/src/app';

const app = createApp({ db: ':memory:' });
afterAll(() => app.db.close());

const mem = (): { load(): Promise<Device | null>; save(d: Device): Promise<void> } => {
  let d: Device | null = null;
  return { load: async () => d, save: async x => { d = x; } };
};
const bytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

describe('онлайн на телефоне', () => {
  test('ссылка приглашения', () => {
    expect(inviteCode('https://durak.gornitsa.games/t/k7m2qx')).toBe('K7M2QX');
    expect(inviteCode('https://durak.gornitsa.games/t/K7M2Q')).toBeNull();
    expect(inviteCode('kozyr://anything')).toBeNull();
  });

  test('сервер отвечает 502: имя не сохранено с причиной «server», после починки — сохраняется (0.5.1)', async () => {
    let broken = true;
    const server = Bun.serve({ port: 0, fetch: req => (broken ? new Response('<html>502 Bad Gateway</html>', { status: 502 }) : app.http.handle(req, '127.0.0.1')) });
    const n = new Net(`http://127.0.0.1:${server.port}`, mem(), '0.5.1');
    const kind = await n.hello('Петя').then(() => 'ok', (e: { kind?: string }) => e.kind);
    expect(kind).toBe('server');
    broken = false;
    expect((await n.hello('Петя')).name).toBe('Петя');
    server.stop(true);
  });

  test('цвет ошибки читается на тёмном столе (AA)', () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const [a, b] = [lum(C.danger), lum(C.bg)].sort((x, y) => y - x);
    expect((a + 0.05) / (b + 0.05)).toBeGreaterThanOrEqual(4.5);
  });

  test('двое и бот: стол по коду, партия опросом до конца, колода проверена; подмена ловится', async () => {
    const server = Bun.serve({ port: 0, fetch: req => app.http.handle(req, '127.0.0.1') });
    const url = `http://127.0.0.1:${server.port}`;
    const a = new Net(url, mem(), '0.2.0'), b = new Net(url, mem(), '0.2.0');
    await a.hello('Аня');
    await b.hello('Боря');
    const t = await a.createTable('podkidnoy', 3, 'novice', hex16(bytes));
    const sit = async (n: Net) => {
      const info = await n.codeInfo(t.code!);
      const seed = hex16(bytes);
      const v = await n.join(t.code!, seed, info.commit);
      const ot = new OnlineTable(n, v.id, false);
      ot.remember({ game: 0, seed, commit: info.commit });
      ot.set(v);
      return ot;
    };
    const ta = await sit(a), tb = await sit(b);
    ta.set(await a.start(t.id));
    const rng = makeRng(2);
    for (let i = 0; i < 3000; i++) {
      let progressed = false;
      for (const ot of [ta, tb]) {
        const r = await ot.net.poll(ot.id, ot.view?.version);
        if ('table' in r) ot.set(r.table);
        const v = ot.view?.game?.view;
        if (!v || ot.view?.status !== 'playing') continue;
        if (!legalFor(v).length) continue;
        const why = await ot.act(chooseAction(v, 'novice', rng));
        if (why === null) progressed = true;
      }
      if (ta.view?.status === 'finished' && tb.view?.status === 'finished') break;
      if (!progressed) await Bun.sleep(150);
    }
    for (const ot of [ta, tb]) {
      const r = await ot.net.poll(ot.id);
      if ('table' in r) ot.set(r.table);
    }
    expect(ta.view?.status).toBe('finished');
    expect(ta.check?.ok).toBe(true);
    expect(tb.check?.ok).toBe(true);
    expect(ta.check!.cards).toBeGreaterThan(10);
    // подменённое доказательство: другая карта в колоде — не сходится
    const g = ta.view!.game!;
    const proof = g.proof!;
    const swapped = { ...proof, seeds: proof.seeds.map((s, i) => (i === 2 ? 'ff'.repeat(16) : s)) };
    const seen: never[] = [];
    expect(verifyGame(swapped, { seat: 0, seed: proof.seeds[0], commit: proof.commit, variant: 'podkidnoy', seats: 3 }, seen).ok).toBe(false);
    expect(verifyGame(proof, { seat: 0, seed: proof.seeds[0], commit: '0'.repeat(64), variant: 'podkidnoy', seats: 3 }, seen).why).toBe('commit');
    expect(verifyGame(proof, { seat: 0, seed: 'aa'.repeat(16), commit: proof.commit, variant: 'podkidnoy', seats: 3 }, seen).why).toBe('seed');
    server.stop(true);
  }, 120_000);
});
