// Сеть седьмого уровня «Мастер» (`neural`, docs/specs/2026-11-neural.md): признаки, оценка, бот для игры, арены и
// самоигры и веса, вшитые в сборку (`weights.ts` пишет tools/gpu/embed.ts).
export { FEATURES_VERSION, INPUTS, RAW, RAW_SIZE, ZONE, encode, features, pack } from './features';
export { costOf, logitOf, netFromBin, valueOf } from './model';
export type { Net } from './model';
export { NET_PARAMS, netScores, netThink, valueAt } from './bot';
export type { NetParams, NetScored } from './bot';
export { Base64Reader, fromBase64, LOAD_CHUNK, loadMaster, masterNet, netLoader } from './embedded';
export { MASTER_WEIGHTS } from './weights';
export type { Weights } from './weights';
