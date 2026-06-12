/**
 * electron-builder afterPack hook — ad-hoc signs the macOS bundle.
 *
 * The release pipeline ships without a Developer ID until the GA signing/
 * notarization pass (implementation-plan §7). A completely UNSIGNED arm64
 * bundle downloaded from the internet hard-fails Gatekeeper ("damaged and
 * can't be opened"). An ad-hoc signature (codesign -s -) keeps the bundle
 * internally consistent, so Gatekeeper shows the bypassable "unverified
 * developer" dialog instead. No-op on non-mac targets and when a real
 * identity was used.
 */
const { execSync } = require('node:child_process');
const { join } = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = join(context.appOutDir, appName);
  console.log(`adhocSign: codesign --force --deep --sign - "${appPath}"`);
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
  execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'inherit' });
};
