// Empty web stand-in for native-only modules that BugReporter require()s at
// module load (react-native-view-shot, expo-screen-capture). See metro.config.js.
// On web the requires resolve to this empty object, so `captureScreen` /
// `addScreenshotListener` are simply undefined and BugReporter degrades to its
// pill + note-only path (it already disables screenshot capture on web). Metro
// no longer has to resolve the real native packages for a web session.
module.exports = {};
