// из nardy: tools/test/apksize.test.ts @ c06342c — без проверок денег: модуля денег здесь пока нет (этап Е).
// Размер APK: плагин сборки включает R8, оставляет ресурсы только русские и английские и
// выключает GIF и WebP из Fresco. Тег v0.2.0 без него собрал APK на 65 МБ при пределе 60.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');

type Prop = { type: string; key?: string; value?: string };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { transforms: t } = require('../../plugins/with-small-apk.js') as {
  transforms: {
    properties: (p: Prop[]) => Prop[];
    buildGradle: (s: string) => string;
    proguard: (s: string) => string;
    LOCALES: string[];
  };
};

const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')) as {
  expo: { plugins: (string | unknown[])[]; locales: Record<string, unknown>; android: { blockedPermissions: string[] } };
};

describe('плагин размера APK', () => {
  test('свойства Gradle: R8 и сжатие ресурсов включены, GIF и WebP выключены, прочее — как было', () => {
    const before: Prop[] = [
      { type: 'comment', value: 'шаблон' },
      { type: 'property', key: 'expo.gif.enabled', value: 'true' },
      { type: 'property', key: 'hermesEnabled', value: 'true' },
    ];
    const after = t.properties(before);
    const val = (k: string) => after.filter(p => p.key === k).map(p => p.value);
    expect(val('android.enableMinifyInReleaseBuilds')).toEqual(['true']);
    expect(val('android.enableShrinkResourcesInReleaseBuilds')).toEqual(['true']);
    expect(val('expo.gif.enabled')).toEqual(['false']);
    expect(val('expo.webp.enabled')).toEqual(['false']);
    expect(val('hermesEnabled')).toEqual(['true']);
    expect(after[0]).toEqual({ type: 'comment', value: 'шаблон' });
  });

  test('build.gradle: только ru и en, один раз', () => {
    const gradle = "android {\n    namespace 'games.gornitsa.durak'\n    defaultConfig {\n        applicationId 'games.gornitsa.durak'\n    }\n}\n";
    const once = t.buildGradle(gradle);
    expect(once).toContain("localeFilters += ['ru', 'en']");
    expect(t.buildGradle(once)).toBe(once);
    expect(() => t.buildGradle('android {}\n')).toThrow();
  });

  test('языки ресурсов покрывают языки app.json', () => {
    for (const l of Object.keys(app.expo.locales)) expect(t.LOCALES).toContain(l);
  });

  test('правило R8 дописывается один раз', () => {
    const rules = t.proguard('# шаблон\n');
    expect(t.proguard(rules)).toBe(rules);
  });

  test('app.json: плагин подключён, INSTALL_REFERRER запрещён', () => {
    expect(app.expo.plugins).toContain('./plugins/with-small-apk');
    expect(app.expo.android.blockedPermissions).toContain('com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE');
  });
});
