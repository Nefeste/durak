// из nardy: plugins/with-small-apk.js @ 1d2bdff
// Размер APK (docs/specs/2026-11-apk-size.md): сборка без лишнего. Папки android/ в репозитории
// нет (CNG), поэтому настройки сборки пишутся здесь:
//   - R8 сжимает код и выбрасывает неиспользуемые классы и ресурсы (`android.enableMinify…`,
//     `android.enableShrinkResources…`) — код в APK вдвое меньше;
//   - строки и ресурсы библиотек — только русские и английские (`localeFilters`): игра на
//     русском, английский — для будущего словаря, а переводы AndroidX и SDK на десятки языков
//     весят больше мегабайта;
//   - без GIF и WebP из Fresco (`expo.gif.enabled`, `expo.webp.enabled`): картинок через
//     `<Image>` в игре нет, WebP-ресурсы Android с API 24 читает сам.
// R8 переименовывает классы. Обёртка RuStore отдаёт в JS имя класса ошибки (`code`), и игра
// узнаёт по нему причину (`src/money/rustoreRules.ts`, `@gornitsa/kit/rustore-pay/rules`) —
// поэтому имена исключений RuStore сохраняются (`KEEP`); тест проверяет правило.
const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withDangerousMod, withGradleProperties } = require('expo/config-plugins');

const PROPS = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
  'expo.gif.enabled': 'false',
  'expo.webp.enabled': 'false',
};

const LOCALES = ['ru', 'en'];

const MARK = '# plugins/with-small-apk.js';
const KEEP = `${MARK}: имена исключений RuStore — это коды ошибок для игры
-keepnames class ru.rustore.** extends java.lang.Throwable
-keepnames class ru.rustore.sdk.core.exception.**
-keepnames class ru.rustore.sdk.pay.model.RuStorePaymentException$*
`;

/** Свойства Gradle: наши значения поверх шаблона, остальное — как было. */
function properties(items) {
  const rest = items.filter(i => !(i.type === 'property' && i.key in PROPS));
  return [...rest, ...Object.entries(PROPS).map(([key, value]) => ({ type: 'property', key, value }))];
}

/** app/build.gradle: только нужные языки ресурсов; второй раз не добавляется. */
function buildGradle(text) {
  if (text.includes('localeFilters')) return text;
  const at = text.indexOf('    defaultConfig {');
  if (at < 0) throw new Error('with-small-apk: в app/build.gradle нет defaultConfig');
  const block = `    androidResources {\n        localeFilters += [${LOCALES.map(l => `'${l}'`).join(', ')}]\n    }\n`;
  return text.slice(0, at) + block + text.slice(at);
}

/** proguard-rules.pro: правило R8 дописывается один раз. */
function proguard(text) {
  return text.includes(MARK) ? text : `${text.replace(/\n*$/, '\n')}\n${KEEP}`;
}

const withSmallApk = config => {
  config = withGradleProperties(config, c => {
    c.modResults = properties(c.modResults);
    return c;
  });
  config = withAppBuildGradle(config, c => {
    c.modResults.contents = buildGradle(c.modResults.contents);
    return c;
  });
  return withDangerousMod(config, ['android', async c => {
    const file = path.join(c.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    fs.writeFileSync(file, proguard(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''));
    return c;
  }]);
};

module.exports = withSmallApk;
module.exports.transforms = { properties, buildGradle, proguard, PROPS, LOCALES, KEEP };
