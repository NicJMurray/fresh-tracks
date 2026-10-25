import { DEFAULT_SEEDS, type Playlist } from './catalog';
import { readSpotify, fingerprint } from './spotify';

interface Stored { id: string; payload: string; fingerprint: string; first_seen: string; fetched_at: string; changed_at: string | null; used_at: string }
const hour = 3_600_000;
export async function getPlaylist(db: D1Database, id: string, refresh = false, markUsed = true): Promise<Playlist> {
  const now = new Date().toISOString();
  const stored = await db.prepare('SELECT * FROM playlists WHERE id = ?').bind(id).first<Stored>();
  // Even explicit refreshes reuse a 15-minute snapshot; automatic visits reuse one hour.
  if (stored && Date.parse(now) - Date.parse(stored.fetched_at) < (refresh ? hour / 4 : hour)) {
    if (markUsed) await db.prepare('UPDATE playlists SET used_at = ? WHERE id = ?').bind(now, id).run();
    return JSON.parse(stored.payload) as Playlist;
  }
  try {
    const playlist = await readSpotify(id, now);
    const hash = await fingerprint(playlist);
    playlist.firstSeen = stored?.first_seen || now;
    playlist.changedAt = stored && hash !== stored.fingerprint ? now : stored?.changed_at || null;
    const payload = JSON.stringify(playlist);
    await db.batch([
      db.prepare(`INSERT INTO playlists (id, payload, fingerprint, first_seen, fetched_at, changed_at, used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,
        fingerprint=excluded.fingerprint, fetched_at=excluded.fetched_at, changed_at=excluded.changed_at, used_at=excluded.used_at`)
        .bind(id, payload, hash, playlist.firstSeen, now, playlist.changedAt, markUsed ? now : stored?.used_at || now),
      db.prepare('INSERT INTO snapshots (playlist_id, day, payload) VALUES (?, ?, ?) ON CONFLICT(playlist_id, day) DO UPDATE SET payload=excluded.payload')
        .bind(id, now.slice(0, 10), payload),
    ]);
    return playlist;
  } catch (error) {
    if (!stored) throw error;
    return { ...JSON.parse(stored.payload) as Playlist, stale: true, error: error instanceof Error ? error.message : 'Could not refresh Spotify.' };
  }
}
export async function previousPlaylists(db: D1Database, ids: string[], now = new Date()) {
  const target = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const oldest = new Date(now.getTime() - 10 * 86_400_000).toISOString().slice(0, 10);
  const rows = await db.batch<{ payload: string; day: string }>(ids.map(id => db.prepare(
    'SELECT payload, day FROM snapshots WHERE playlist_id = ? AND day <= ? AND day >= ? ORDER BY day DESC LIMIT 1'
  ).bind(id, target, oldest)));
  return { ready: ids.length > 0 && rows.every(row => row.results.length === 1),
    playlists: rows.flatMap(row => row.results.map(item => JSON.parse(item.payload) as Playlist)), target };
}
export async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await work(items[i]); }
  }));
  return results;
}
export async function dailyRefresh(db: D1Database) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const recent = await db.prepare('SELECT id FROM playlists WHERE used_at >= ? ORDER BY used_at DESC LIMIT 25').bind(since).all<{ id: string }>();
  const ids = [...new Set([...DEFAULT_SEEDS.map(s => s.id), ...recent.results.map(row => row.id)])];
  const result = await mapLimit(ids, 3, async id => {
    try { const playlist = await getPlaylist(db, id, true, false); return { id, ok: !playlist.stale }; }
    catch { return { id, ok: false }; }
  });
  const expiry = new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10);
  await db.batch([
    db.prepare('DELETE FROM snapshots WHERE day < ?').bind(expiry),
    db.prepare('DELETE FROM search_cache WHERE fetched_at < ?').bind(new Date(Date.now() - 86_400_000).toISOString()),
  ]);
  console.log(JSON.stringify({ event: 'daily_refresh', checked: result.length, succeeded: result.filter(row => row.ok).length }));
}
