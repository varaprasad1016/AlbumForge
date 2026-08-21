/**
 * Ad-hoc sign the macOS app bundle so electron-updater's signature checks pass
 * without an Apple Developer certificate. Runs after the app is packed and
 * before the DMG/zip targets are created, so both the installer and the
 * updater archive contain the signed app.
 *
 * Users will still see a Gatekeeper warning on first launch (the app is not
 * notarized); right-click → Open, as with any unsigned build.
 */
const { execFileSync } = require("child_process");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  console.log(`Ad-hoc signing ${appPath}`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath]);
};
