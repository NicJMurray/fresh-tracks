import { DEFAULT_SEEDS, MAX_SEEDS, playlistId, type Playlist } from './catalog';
import { aggregate, compare } from './signals';
import { getPlaylist, previousPlaylists, mapLimit, dailyRefresh } from './store';
import { cleanTerms, discover } from './discovery';
import { boundedText } from './spotify';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
function seedIds(input: unknown): string[] {
  if (!Array.isArray(input) || input.length > MAX_SEEDS) throw new Error(`Use up to ${MAX_SEEDS} seed playlists.`);
  const ids = input.map(playlistId);
  if (ids.some(id => !id)) throw new Error('Use valid Spotify playlist links or IDs.');
  return [...new Set([...DEFAULT_SEEDS.map(s => s.id), ...ids as string[]])].slice(0, MAX_SEEDS);
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (url.pathname === '/api/health') return json({ ok: true, app: 'fresh-tracks', version: env.VERSION.id });
      if (url.pathname === '/api/config' && request.method === 'GET') return json({ defaults: DEFAULT_SEEDS, maxSeeds: MAX_SEEDS, source: 'Spotify public previews', previewLimit: 100 });
      if (!['/api/analyse', '/api/discover'].includes(url.pathname)) return json({ error: 'Not found.' }, 404);
      if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return json({ error: 'Use this app to make the request.' }, 403);
      if (!request.headers.get('Content-Type')?.includes('application/json')) return json({ error: 'Send JSON.' }, 415);
      let body: { seeds?: unknown; refresh?: unknown; artists?: unknown; tracks?: unknown };
      try { body = JSON.parse(await boundedText(request, 16_000)); } catch { return json({ error: 'Invalid or oversized request.' }, 400); }
      let ids: string[];
      try { ids = seedIds(body.seeds || []); } catch (e) { return json({ error: (e as Error).message }, 400); }
      if (url.pathname === '/api/discover') {
        const artists = cleanTerms(body.artists), tracks = cleanTerms(body.tracks);
        if (!artists.length && !tracks.length) return json({ error: 'Enter an artist or track to search for.' }, 400);
        return json(await discover(env.DB, artists, tracks, ids));
      }
      const checked = await mapLimit(ids, 3, async id => {
        try { return { id, playlist: await getPlaylist(env.DB, id, body.refresh === true), error: null }; }
        catch (error) { return { id, playlist: null, error: error instanceof Error ? error.message : 'Could not read this playlist.' }; }
      });
      const playlists = checked.flatMap(row => row.playlist ? [row.playlist] : []);
      const old = await previousPlaylists(env.DB, ids);
      const historyReady = old.ready && checked.every(row => row.playlist && !row.playlist.stale);
      const current = aggregate(playlists), previous = aggregate(old.playlists);
      const shared = current.tracks.filter(t => t.count > 1), previousShared = previous.tracks.filter(t => t.count > 1);
      const response = { playlists: checked, defaults: DEFAULT_SEEDS.map(s => s.id),
        artists: compare(current.artists, previous.artists, historyReady), tracks: compare(shared, previousShared, historyReady),
        metrics: { seeds: ids.length, readable: playlists.length, artists: current.artists.length, uniqueTracks: current.tracks.length, sharedTracks: shared.length,
          visibleTracks: playlists.reduce((sum, p) => sum + p.tracks.length, 0), capped: playlists.filter(p => p.capped).length },
        history: { ready: historyReady, target: old.target, message: historyReady ? 'Compared with the same seed collection a week ago.' : 'Building your baseline. Weekly movement appears once every seed has a week of history.' },
        checkedAt: new Date().toISOString() };
      return json(response);
    } catch (error) {
      console.error(JSON.stringify({ event: 'request_failed', path: url.pathname, message: error instanceof Error ? error.message : 'Unknown error' }));
      return json({ error: 'Could not complete this request. Please try again.' }, 503);
    }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(dailyRefresh(env.DB)); },
} satisfies ExportedHandler<Env>;
