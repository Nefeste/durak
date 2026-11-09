// Сеть седьмого уровня (docs/specs/2026-11-neural.md). В меню приложения её пока нет: уровень `neural` закрыт до
// обученной сети (решение владельца #15). Здесь — признаки, оценка и бот для арены и самоигры.
export { FEATURES_VERSION, INPUTS, RAW, RAW_SIZE, ZONE, encode, features, pack } from './features';
export { costOf, logitOf, netFromBin, valueOf } from './model';
export type { Net } from './model';
export { NET_PARAMS, netScores, netThink, valueAt } from './bot';
export type { NetParams, NetScored } from './bot';
