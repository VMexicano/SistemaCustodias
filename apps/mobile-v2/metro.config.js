// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// @rnmapbox/maps lib/module has {"type":"module"} which conflicts with Metro's ESM resolver.
// Disable package exports resolution to use the classic main/index.js field instead.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
