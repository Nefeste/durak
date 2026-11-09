// Игроки арены по названию: уровень приложения или бот на сети `net:<файл.bin>[:раскладов[:now|bout]]`
// (docs/specs/2026-11-neural.md, «Арена»). Боты видят только наблюдение своего места.
import { readFileSync } from 'node:fs';
import type { Action, Observation } from '../../src/engine';
import { chooseAction, isLevel, thinkSync } from '../../src/bot';
import type { Level, Rng } from '../../src/bot';
import { NET_PARAMS, netFromBin, netThink } from '../../src/bot/net';
import type { Net, NetParams } from '../../src/bot/net';

export type Player = (o: Observation, rng: Rng) => Action;

export const loadNet = (path: string): Net => netFromBin(new Uint8Array(readFileSync(path)));

const cache = new Map<string, Player>();

export function playerOf(spec: string): Player {
  const known = cache.get(spec);
  if (known) return known;
  let play: Player;
  if (isLevel(spec)) play = (o, rng) => chooseAction(o, spec as Level, rng);
  else if (spec.startsWith('net:')) {
    const [, path, samples, horizon] = spec.split(':');
    const net = loadNet(path);
    const p: NetParams = { ...NET_PARAMS, ...(samples ? { samples: Number(samples) } : {}), ...(horizon ? { horizon: horizon as NetParams['horizon'] } : {}) };
    play = (o, rng) => thinkSync(netThink(o, net, p, rng));
  } else throw new Error(`игрок: уровень (novice beginner amateur average experienced master) или net:<файл.bin>, а не «${spec}»`);
  cache.set(spec, play);
  return play;
}
