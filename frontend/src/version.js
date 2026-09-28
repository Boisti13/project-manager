// The version this interface was built with: frontend/package.json, which is
// kept equal to the server's VERSION. Set at build time (.env.production:
// REACT_APP_VERSION=$npm_package_version); empty in tests and `npm start`.
export const APP_VERSION = process.env.REACT_APP_VERSION || '';

const parts = (v) => String(v || '').split('.').map((n) => parseInt(n, 10) || 0);

/**
 * How a server version relates to the version an interface was built for,
 * counting only features (major.minor), not fix or docs releases:
 * 'server-newer' (the interface lacks what the server added since),
 * 'server-older' (the interface expects things the server doesn't have yet),
 * or null (same features, or a version is unknown).
 */
export function compareFeatures(serverVersion, appVersion = APP_VERSION) {
  if (!serverVersion || !appVersion) return null;
  const [s1, s2] = parts(serverVersion);
  const [a1, a2] = parts(appVersion);
  if (s1 !== a1) return s1 > a1 ? 'server-newer' : 'server-older';
  if (s2 !== a2) return s2 > a2 ? 'server-newer' : 'server-older';
  return null;
}
