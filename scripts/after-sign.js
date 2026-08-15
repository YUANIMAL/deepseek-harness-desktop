'use strict';

// Ad-hoc sign the packaged .app (codesign --sign -) so Gatekeeper's
// right-click → Open works on modern macOS (15+ blocks apps with NO signature
// at all). Real-signed builds (Developer ID) are detected and left untouched.

const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterSign(context) {
  const { appOutDir, packager } = context;
  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);

  let info = '';
  try {
    info = execFileSync('codesign', ['-dv', appPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // not signed at all → ad-hoc sign below
  }

  if (info.includes('Authority=Developer ID')) {
    console.log('[after-sign] real Developer ID signature present — skipping ad-hoc sign.');
    return;
  }

  console.log(`[after-sign] ad-hoc signing (Gatekeeper bypass): ${appPath}`);
  execFileSync('codesign', ['--deep', '--force', '--sign', '-', appPath], { stdio: 'inherit' });
};
