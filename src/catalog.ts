export const DEFAULT_SEEDS = [
  { id: '0ilfvphYHT6moQB3bKBrCN', title: 'PRIVATE RADIO: September 2026' },
  { id: '5BmFSpGgKfk8dbTDZGecYZ', title: 'Rated by The Face' },
  { id: '7olahJozXwFRVtfyDfMQ2k', title: 'what is alex banin listening to' },
  { id: '7f9o34JAe8ZSRq4GX7f0Ol', title: 'Pitchfork Selects' },
  { id: '43VgdDhgkYsXtTQDGOhqmZ', title: 'Rotation Weekly' },
] as const;
export const MAX_SEEDS = 30;
export const PREVIEW_LIMIT = 100;
export const playlistUrl = (id: string) => `https://open.spotify.com/playlist/${id}`;
export function playlistId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (/^[a-zA-Z0-9]{22}$/.test(value)) return value;
  const uri = value.match(/^spotify:playlist:([a-zA-Z0-9]{22})$/);
  if (uri) return uri[1];
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || url.port || url.username || url.password) return null;
    return url.pathname.match(/^\/(?:intl-[a-z-]+\/|embed\/)?playlist\/([a-zA-Z0-9]{22})\/?$/)?.[1] || null;
  } catch { return null; }
}
export const nameKey = (name: string) => name.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();
export interface Track { id: string; title: string; artists: string[] }
export interface Playlist {
  id: string; title: string; owner: string; image: string | null; tracks: Track[];
  source: 'spotify-public-preview'; coverage: 'preview'; capped: boolean;
  fetchedAt: string; firstSeen: string; changedAt: string | null;
  stale?: boolean; error?: string;
}
export interface Ranked {
  id: string; name: string; artists?: string[]; playlists: string[]; count: number; appearances: number;
  rank: number; previousRank?: number; change?: number; newToTop10?: boolean;
}
