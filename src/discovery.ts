import { nameKey, playlistId } from './catalog';
import { matches } from './signals';
import { getPlaylist, mapLimit } from './store';
import { boundedText } from './spotify';

type Candidate = { id: string; title: string; snippet: string };
const termsKey = (values: string[]) => [...new Set(values.map(nameKey))].sort();
export function cleanTerms(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((s): s is string => typeof s === 'string').map(s => s.replace(/[\x00-\x1f"\\]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 3).map(s => s.slice(0, 100));
}
export async function discover(db: D1Database, artists: string[], tracks: string[], excluded: string[]) {
  const key = JSON.stringify(['spotify-only-v2', termsKey(artists), termsKey(tracks)]);
  const cached = await db.prepare('SELECT payload, fetched_at FROM search_cache WHERE query = ?').bind(key).first<{ payload: string; fetched_at: string }>();
  let candidates: Candidate[] = [];
  let warning: string | null = null;
  if (cached && Date.now() - Date.parse(cached.fetched_at) < 4 * 3_600_000) candidates = JSON.parse(cached.payload);
  else {
    const queries = [artists, tracks].filter(group => group.length).map(group => `site:open.spotify.com inurl:playlist (${group.map(t => `"${t}"`).join(' OR ')}) playlist`);
    const searches = await Promise.allSettled(queries.map(async q => {
      // This existing Pages Function owns the Google credentials. No credentials cross into this application.
      const url = new URL('https://playlist.njmurray.com/api/playlists');
      url.searchParams.set('q', q); url.searchParams.set('limit', '10');
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
      const body = JSON.parse(await boundedText(response, 100_000)) as { error?: string; results?: { title?: string; url?: string; snippet?: string }[] };
      if (!response.ok) throw new Error(body.error || 'Playlist search is temporarily unavailable.');
      return (body.results || []).flatMap(row => { const id = playlistId(row.url); return id ? [{ id, title: row.title || '', snippet: (row.snippet || '').slice(0, 600) }] : []; });
    }));
    const found = new Map<string, Candidate>();
    for (const search of searches) {
      if (search.status === 'fulfilled') for (const item of search.value) found.set(item.id, item);
      else warning = search.reason instanceof Error ? search.reason.message : 'One search could not finish.';
    }
    candidates = [...found.values()];
    if (!warning) await db.prepare('INSERT INTO search_cache (query, payload, fetched_at) VALUES (?, ?, ?) ON CONFLICT(query) DO UPDATE SET payload=excluded.payload, fetched_at=excluded.fetched_at')
      .bind(key, JSON.stringify(candidates), new Date().toISOString()).run();
  }
  const eligible = candidates.filter(c => !excluded.includes(c.id)).slice(0, 10);
  const checked = await mapLimit(eligible, 3, async candidate => {
    try {
      const playlist = await getPlaylist(db, candidate.id);
      const matched = matches(playlist, artists, tracks);
      if (!matched.count || playlist.stale) return null;
      const updateHint = /\b(weekly|daily|updated|every (friday|monday|week|day)|new music|rotation)\b/i.test(`${playlist.title} ${candidate.snippet}`);
      const changedRecently = !!playlist.changedAt && Date.now() - Date.parse(playlist.changedAt) <= 7 * 86_400_000;
      return { id: playlist.id, title: playlist.title, owner: playlist.owner, image: playlist.image, snippet: candidate.snippet,
        matched, updateHint, changedRecently, changedAt: playlist.changedAt, visibleTracks: playlist.tracks.length, capped: playlist.capped };
    } catch { return null; }
  });
  return { results: checked.filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => Number(b.changedRecently) - Number(a.changedRecently) || b.matched.count - a.matched.count || Number(b.updateHint) - Number(a.updateHint)),
    checked: eligible.length, warning, searchedAt: new Date().toISOString() };
}
