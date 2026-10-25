import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SEEDS, playlistId, type Playlist, type Ranked } from '../src/catalog';
import { aggregate, compare, matches } from '../src/signals';
import { parseEmbed, boundedText } from '../src/spotify';
import { cleanTerms } from '../src/discovery';

const id = '0ilfvphYHT6moQB3bKBrCN';
const playlist = (key: string, tracks: Playlist['tracks']): Playlist => ({ id: key, title: key, owner: 'Curator', image: null, tracks, source: 'spotify-public-preview', coverage: 'preview', capped: false, fetchedAt: '2026-10-24T00:00:00Z', firstSeen: '2026-10-24T00:00:00Z', changedAt: null });
const track = (key: string, artists = ['Artist A']) => ({ id: key, title: `Track ${key}`, artists });

test('five defaults are distinct and Spotify URLs are strictly validated', () => {
  assert.equal(new Set(DEFAULT_SEEDS.map(s => s.id)).size, 5);
  for (const value of [id, `https://open.spotify.com/playlist/${id}?si=abc`, `spotify:playlist:${id}`, `https://open.spotify.com/embed/playlist/${id}`, `https://open.spotify.com/intl-en/playlist/${id}`]) assert.equal(playlistId(value), id);
  for (const value of ['https://evil.test/playlist/' + id, 'http://open.spotify.com/playlist/' + id, 'https://open.spotify.com.evil.test/playlist/' + id, 'https://name@open.spotify.com/playlist/' + id, 'https://open.spotify.com/artist/' + id, 'https://open.spotify.com/playlist/short', null]) assert.equal(playlistId(value), null);
});
test('overlap counts distinct playlists, not repeated songs, and credits collaborators', () => {
  const data = aggregate([playlist('one', [track('x', ['Artist A', 'Artist B']), track('x'), track('y')]), playlist('two', [track('x'), track('z', ['artist a'])])]);
  assert.equal(data.artists[0].count, 2);
  assert.equal(data.artists[0].appearances, 4);
  assert.equal(data.artists[0].id, 'artist a');
  assert.equal(data.artists.find(a => a.id === 'artist b')?.count, 1);
  assert.equal(data.tracks.find(t => t.id === 'x')?.count, 2);
  assert.equal(data.tracks.length, 3);
});
test('artist reach takes priority over how many tracks appear in a single playlist', () => {
  const data = aggregate([playlist('one', [track('x'), track('y'), track('z'), track('b', ['Artist B'])]), playlist('two', [track('q', ['Artist B'])])]);
  assert.equal(data.artists[0].name, 'Artist B');
});
test('track IDs distinguish recordings with the same name', () => {
  const data = aggregate([playlist('one', [{ id: 'a', title: 'Same song', artists: ['Band'] }]), playlist('two', [{ id: 'b', title: 'Same song', artists: ['Band'] }])]);
  assert.equal(data.tracks.filter(t => t.count > 1).length, 0);
});
test('new-to-top-ten badges require history and include an artist moving from eleventh', () => {
  const row = (id: string, rank: number): Ranked => ({ id, name: id, count: 2, appearances: 2, playlists: ['a', 'b'], rank });
  const current = [row('riser', 1), row('old', 2), row('debut', 3)];
  const previous = [row('old', 1), row('riser', 11)];
  assert.equal(compare(current, previous, false)[0].newToTop10, undefined);
  const result = compare(current, previous, true);
  assert.equal(result[0].newToTop10, true); assert.equal(result[0].change, 10);
  assert.equal(result[1].newToTop10, false); assert.equal(result[1].change, -1);
  assert.equal(result[2].newToTop10, true);
});
function embed(trackList: unknown[], entityId = id) {
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity: { id: entityId, type: 'playlist', name: 'Fresh <script> titles', subtitle: 'Curator', trackList } } } } } })}</script>`;
}
const rawTrack = { uri: 'spotify:track:1234567890123456789012', title: 'New song', subtitle: 'Earth, Wind & Fire,\u00a0Artist B' };
test('Spotify parsing preserves artist-name commas and splits actual credit separators', () => {
  const p = parseEmbed(embed([rawTrack]), id, '2026-10-24');
  assert.deepEqual(p.tracks[0].artists, ['Earth, Wind & Fire', 'Artist B']);
  assert.equal(p.title, 'Fresh <script> titles'); assert.equal(p.coverage, 'preview');
  assert.equal(p.image, null); assert.equal(p.capped, false);
});
test('preview caps are explicit and failures do not turn into empty successful playlists', () => {
  assert.equal(parseEmbed(embed(Array.from({ length: 100 }, () => rawTrack)), id, '2026-10-24').capped, true);
  assert.throws(() => parseEmbed(embed([], id), id, 'today'), /No music tracks/);
  assert.throws(() => parseEmbed(embed([rawTrack], 'wrong'), id, 'today'), /could not show/);
  assert.throws(() => parseEmbed('<html>Challenge</html>', id, 'today'), /readable public/);
});
test('upstream bodies have a hard byte limit', async () => {
  await assert.rejects(boundedText(new Response('123456'), 5), /size limit/);
  assert.equal(await boundedText(new Response('hello'), 5), 'hello');
});
test('discovery verifies exact names and track titles in the current visible content', () => {
  const p = playlist('one', [{ id: 'x', title: 'New Song', artists: ['Artist A'] }]);
  assert.deepEqual(matches(p, ['artist a', 'Art'], ['NEW SONG']), { artists: ['Artist A'], tracks: ['New Song'], count: 2 });
  assert.equal(matches(p, ['Artist AB'], ['New']).count, 0);
  assert.deepEqual(cleanTerms([' a ', 'a', '"quoted"', 2, '\nnext']), ['a', 'quoted', 'next']);
});
