// Сеть игры на телефоне: один `Net` на приложение, ключ и ник — в AsyncStorage, отметка «Мне есть
// 14 лет» — там же (ADR студии 0016).
import * as Crypto from 'expo-crypto';
import { Net, SERVER, hex16 } from './net';
import type { Device } from './net';
import { KEYS, loadJson, saveJson } from './storage';

let adult = false;
export const isAdult = () => adult;
export async function loadAdult(): Promise<boolean> {
  adult = (await loadJson<boolean>(KEYS.adult)) === true;
  return adult;
}
export async function setAdult(v: boolean): Promise<void> {
  adult = v;
  await saveJson(KEYS.adult, v);
}

export const net = new Net(SERVER, {
  load: () => loadJson<Device>(KEYS.device),
  save: d => saveJson(KEYS.device, d),
}, undefined, isAdult);

/** Зерно места: 16 случайных байт телефона. */
export const newSeed = () => hex16(n => Crypto.getRandomBytes(n));
