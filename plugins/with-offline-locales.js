const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// Show Control: keep presentation languages offline.';
const previousBlock = `${marker}\nandroid.bundle.language.enableSplit = false\n`;
// Expo uses b+he in its language filter; existing Android libraries use the
// legacy values-iw qualifier. Keep both so AAPT does not drop Hebrew entirely.
const block = `${previousBlock}android.defaultConfig.resourceConfigurations.add("iw")\n`;

function applyOfflineLocales(buildGradle) {
  if (buildGradle.language !== 'groovy') throw new Error('Show Control offline locales require the generated Groovy app build.');
  if (buildGradle.contents.includes(marker)) {
    if (buildGradle.contents.split(marker).length !== 2) {
      throw new Error('Review the existing Show Control offline language configuration.');
    }
    if (buildGradle.contents.includes(block)) return buildGradle;
    if (buildGradle.contents.includes(previousBlock)) return { ...buildGradle, contents: buildGradle.contents.replace(previousBlock, block) };
    throw new Error('Review the existing Show Control offline language configuration.');
  }
  return { ...buildGradle, contents: `${buildGradle.contents.trimEnd()}\n\n${block}` };
}

module.exports = (config) => withAppBuildGradle(config, (result) => {
  result.modResults = applyOfflineLocales(result.modResults);
  return result;
});
module.exports.applyOfflineLocales = applyOfflineLocales;
