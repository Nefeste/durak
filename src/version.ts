// Версия игры — одна, из app.json (её же сверяет tools/test/release.test.ts с package.json).
import app from '../app.json';

export const APP_VERSION: string = app.expo.version;
