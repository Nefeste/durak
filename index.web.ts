// из uzory: index.web.ts @ 1391243 (через anamnez) — веб-сборка для сценария в браузере.
// Skia в браузере — это CanvasKit (WASM), а модуль Skia в вебе создаёт свой API при первом
// выполнении. Поэтому сначала загружается CanvasKit, и только потом выполняется приложение:
// `require` внутри then() — Metro кладёт модуль в тот же бандл, но выполняет его в момент вызова.
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { registerRootComponent } from 'expo';

const base = process.env.EXPO_BASE_URL ?? '';

LoadSkiaWeb({ locateFile: (file: string) => `${base}/${file}` }).then(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  registerRootComponent(require('./App').default);
});
