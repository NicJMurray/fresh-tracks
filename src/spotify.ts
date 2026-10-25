import { PREVIEW_LIMIT, nameKey, type Playlist, type Track } from './catalog';

type Json = { [key: string]: unknown };
const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const string = (value: unknown) => typeof value === 'string' ? value : '';
export async function boundedText(response: Pick<Response, 'body'>, limit = 2_000_000): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Upstream response exceeded the safe size limit.');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel(); }
}
export function parseEmbed(html: string, id: string, now: string): Playlist {
  const match = html.match(/<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('Spotify did not return a readable public playlist preview.');
  let root: Json;
  try { root = object(JSON.parse(match[1])); } catch { throw new Error('Spotify returned an unreadable playlist preview.'); }
  const props = object(object(root.props).pageProps);
  const entity = object(object(object(props.state).data).entity);
  if (entity.type !== 'playlist' || entity.id !== id || !Array.isArray(entity.trackList)) throw new Error('Spotify could not show this playlist. Check that it is public.');
  const tracks: Track[] = [];
  for (const raw of entity.trackList.slice(0, PREVIEW_LIMIT)) {
    const row = object(raw), trackId = string(row.uri).match(/^spotify:track:([a-zA-Z0-9]{22})$/)?.[1];
    if (!trackId || !string(row.title).trim()) continue;
    // Spotify separates credits using comma + non-breaking space; ordinary commas can belong to an artist's name.
    const artists = string(row.subtitle).split(/,\s*\u00a0\s*/u).map(s => s.trim()).filter(Boolean);
    tracks.push({ id: trackId, title: string(row.title).slice(0, 300), artists });
  }
  if (!tracks.length) throw new Error('No music tracks are visible in this Spotify preview.');
  const cover = object(entity.coverArt).sources;
  const image = Array.isArray(cover) ? string(object(cover[0]).url) : '';
  const safeImage = /^https:\/\/(?:i\.scdn\.co|image-cdn-[a-z]+\.spotifycdn\.com)\//.test(image) ? image : null;
  return { id, title: string(entity.name || entity.title).slice(0, 300) || 'Spotify playlist', owner: string(entity.subtitle).slice(0, 160),
    image: safeImage, tracks, source: 'spotify-public-preview', coverage: 'preview', capped: entity.trackList.length >= PREVIEW_LIMIT,
    fetchedAt: now, firstSeen: now, changedAt: null };
}
export async function readSpotify(id: string, now: string, fetcher: typeof fetch = fetch): Promise<Playlist> {
  const response = await fetcher(`https://open.spotify.com/embed/playlist/${id}?utm_source=generator`, {
    headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(15_000), redirect: 'manual',
  });
  if (!response.ok) throw new Error(response.status === 429 ? 'Spotify is rate limiting previews. Try again later.' : `Spotify preview is unavailable (${response.status}).`);
  return parseEmbed(await boundedText(response), id, now);
}
export async function fingerprint(playlist: Playlist): Promise<string> {
  const content = playlist.tracks.map(t => [t.id, nameKey(t.title), ...t.artists.map(nameKey).sort()].join('|')).sort().join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
