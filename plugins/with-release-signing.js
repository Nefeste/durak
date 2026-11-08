// из nardy: plugins/with-release-signing.js @ 1d2bdff (из votchina) — свойства DURAK_*.
// Постоянный ключ подписи релизной сборки (ADR 0006 устава).
//
// Папки android/ в репозитории нет — её создаёт `expo prebuild` (CNG), поэтому подпись
// настраивается здесь, а не правкой build.gradle. Шаблон подписывает релиз отладочным
// ключом React Native, а он общеизвестен: любой APK с тем же именем пакета, подписанный им,
// встаёт обновлением поверх «Козыря» и читает его хранилище — вместе с ключом устройства.
//
// Ключ приходит свойствами Gradle. В CI это переменные ORG_GRADLE_PROJECT_DURAK_UPLOAD_*
// из секретов репозитория (.github/workflows/android.yml). Нет свойства с файлом ключа —
// релиз подписывается как раньше: так собирается всё до версии, с которой ключ меняется.
const { withAppBuildGradle } = require('expo/config-plugins');

const STORE = 'DURAK_UPLOAD_STORE_FILE';

/**
 * Дописывает в build.gradle релизную подпись. Шаблон build.gradle меняется от версии
 * к версии Expo; если он изменился так, что подпись встать не может, — исключение:
 * молча собрать релиз отладочным ключом после перехода на постоянный хуже, чем не собрать.
 */
function addReleaseSigning(gradle) {
  if (gradle.includes(STORE)) return gradle;
  const configs = /signingConfigs\s*\{/;
  const release = /(buildTypes\s*\{[\s\S]*?\brelease\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/;
  if (!configs.test(gradle) || !release.test(gradle)) {
    throw new Error('with-release-signing: шаблон android/app/build.gradle изменился — подпись релиза не настроена');
  }
  return gradle
    .replace(configs, m => `${m}
        release {
            if (project.hasProperty('${STORE}')) {
                storeFile file(project.property('${STORE}'))
                storePassword project.property('DURAK_UPLOAD_STORE_PASSWORD')
                keyAlias project.property('DURAK_UPLOAD_KEY_ALIAS')
                keyPassword project.property('DURAK_UPLOAD_KEY_PASSWORD')
            }
        }`)
    .replace(release, `$1signingConfig(project.hasProperty('${STORE}') ? signingConfigs.release : signingConfigs.debug)`);
}

const withReleaseSigning = config => withAppBuildGradle(config, c => {
  if (c.modResults.language !== 'groovy') throw new Error('with-release-signing: ожидался build.gradle на Groovy');
  c.modResults.contents = addReleaseSigning(c.modResults.contents);
  return c;
});

module.exports = withReleaseSigning;
module.exports.addReleaseSigning = addReleaseSigning;
