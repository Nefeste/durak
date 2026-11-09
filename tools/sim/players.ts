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

/** `net:<файл>[:<раскладов>][:now|bout]`. Разбор справа: в пути самом бывает «:» — `D:\…` на Windows. */
export function netSpec(spec: string): { path: string; samples?: number; horizon?: NetParams['horizon'] } {
  const parts = spec.slice('net:'.length).split(':');
  const out: { path: string; samples?: number; horizon?: NetParams['horizon'] } = { path: '' };
  if (parts.length > 1 && (parts.at(-1) === 'now' || parts.at(-1) === 'bout')) out.horizon = parts.pop() as NetParams['horizon'];
  if (parts.length > 1 && /^\d+$/.test(parts.at(-1)!)) out.samples = Number(parts.pop());
  out.path = parts.join(':');
  return out;
}

const cache = new Map<string, Player>();

export function playerOf(spec: string): Player {
  const known = cache.get(spec);
  if (known) return known;
  let play: Player;
  if (isLevel(spec)) play = (o, rng) => chooseAction(o, spec as Level, rng);
  else if (spec.startsWith('net:')) {
    const { path, samples, horizon } = netSpec(spec);
    const net = loadNet(path);
    const p: NetParams = { ...NET_PARAMS, ...(samples ? { samples } : {}), ...(horizon ? { horizon } : {}) };
    play = (o, rng) => thinkSync(netThink(o, net, p, rng));
  } else throw new Error(`игрок: уровень (novice beginner amateur average experienced master) или net:<файл.bin>, а не «${spec}»`);
  cache.set(spec, play);
  return play;
}
