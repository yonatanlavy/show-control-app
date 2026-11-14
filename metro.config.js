const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const separator = '[/\\\\]';
// Native compilation and whisper sources are not JavaScript dependencies.
// Keeping generated trees out of Metro prevents Windows file-map stalls after
// a native rebuild, while module index/config files remain discoverable.
const generatedRoots = [
  'android/.gradle', 'android/.cxx', 'android/build', 'android/app/build',
  'ios/Pods', 'ios/build', 'dist', '.native-check',
  'modules/show-voice/vendor', 'modules/show-voice/ios/vendor',
  ...['show-audio', 'show-controller', 'show-voice', 'show-visual', 'show-commerce'].flatMap((name) =>
    [`modules/${name}/android/build`, `modules/${name}/android/.cxx`, `modules/${name}/ios/build`]),
];
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...generatedRoots.map((relative) => new RegExp(`^${escape(__dirname.replace(/\\/g, '/')).replace(/\//g, separator)}${separator}${relative.split('/').map(escape).join(separator)}(?:${separator}|$)`)),
];

module.exports = config;
