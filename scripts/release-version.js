// Checks a release tag against app.json and derives the Android versionCode.
// Used by .github/workflows/release.yml; plain Node so CI needs no extra tooling.
const fs = require('fs');
const path = require('path');

const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function releaseVersion(tag, appVersion) {
  const m = TAG.exec(tag);
  if (!m) throw new Error(`Tag "${tag}" must be vMAJOR.MINOR.PATCH, e.g. v1.2.3`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (minor > 99 || patch > 99) throw new Error(`Tag "${tag}": minor and patch must be 0-99`);
  const versionName = `${major}.${minor}.${patch}`;
  if (versionName !== appVersion) {
    throw new Error(`Tag ${tag} does not match app.json version ${appVersion}; bump app.json first`);
  }
  return { versionName, versionCode: major * 10000 + minor * 100 + patch };
}

if (require.main === module) {
  try {
    const appJsonPath = path.join(__dirname, '..', 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    const { versionName, versionCode } = releaseVersion(process.argv[2] ?? '', appJson.expo.version);
    appJson.expo.android.versionCode = versionCode;
    fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
    console.log(`versionName=${versionName}`);
    console.log(`versionCode=${versionCode}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { releaseVersion };
