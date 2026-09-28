// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { compareFeatures } from './version';

test('only feature releases count between server and interface', () => {
  assert.strictEqual(compareFeatures('1.40.0', '1.39.2'), 'server-newer');
  assert.strictEqual(compareFeatures('2.0.0', '1.39.2'), 'server-newer');
  assert.strictEqual(compareFeatures('1.38.5', '1.39.0'), 'server-older');
  assert.strictEqual(compareFeatures('1.39.3', '1.39.2'), null); // a fix / docs release
  assert.strictEqual(compareFeatures('1.39.0', '1.39.9'), null);
  assert.strictEqual(compareFeatures('1.10.0', '1.9.0'), 'server-newer'); // numbers, not text
  assert.strictEqual(compareFeatures(null, '1.39.0'), null);
  assert.strictEqual(compareFeatures('1.39.0', ''), null); // unknown build (tests, npm start)
});
