const { withProjectBuildGradle } = require('expo/config-plugins');

module.exports = (config) =>
  withProjectBuildGradle(config, (c) => {
    const marker = '// pdfmaster-skip-kotlin-metadata';
    if (c.modResults.language === 'groovy' && !c.modResults.contents.includes(marker)) {
      c.modResults.contents += `
${marker}
allprojects {
  tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    kotlinOptions.freeCompilerArgs += ['-Xskip-metadata-version-check']
  }
}
`;
    }
    return c;
  });
