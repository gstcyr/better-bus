// Dynamic Expo config.
//
// Its only job is to inject secrets that must NOT live in version control — right
// now, the Google Maps Android API key — into the static config from app.json.
// Expo merges the two: app.json is loaded first and passed here as `config`.
//
// The key is read from the environment. Expo CLI auto-loads .env* files before
// evaluating this file, so putting it in `.env.local` (gitignored) is enough:
//
//   GOOGLE_MAPS_API_KEY=AIza...
//
// The key only reaches the native project when `expo prebuild` runs (that's what
// writes it into android/AndroidManifest.xml). Since android/ is gitignored, the
// key never gets committed either way.

module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!googleMapsApiKey) {
    console.warn(
      '[app.config] GOOGLE_MAPS_API_KEY is not set — the Android map will render blank. ' +
        'Add it to .env.local (see .env.example).',
    );
  }

  return {
    ...config,
    plugins: (config.plugins ?? []).map((plugin) =>
      Array.isArray(plugin) && plugin[0] === 'react-native-maps'
        ? ['react-native-maps', { ...plugin[1], androidGoogleMapsApiKey: googleMapsApiKey }]
        : plugin,
    ),
  };
};
