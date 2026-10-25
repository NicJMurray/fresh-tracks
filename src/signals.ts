import { nameKey, type Playlist, type Ranked } from './catalog';

export function aggregate(playlists: Playlist[]) {
  const artists = new Map<string, { name: string; playlists: Set<string>; tracks: Set<string> }>();
  const songs = new Map<string, { name: string; artists: string[]; playlists: Set<string> }>();
  for (const playlist of playlists) {
    const seenTracks = new Set<string>();
    for (const track of playlist.tracks) {
      if (seenTracks.has(track.id)) continue;
      seenTracks.add(track.id);
      const song = songs.get(track.id) || { name: track.title, artists: track.artists, playlists: new Set<string>() };
      song.playlists.add(playlist.id); songs.set(track.id, song);
      for (const name of new Set(track.artists)) {
        const key = nameKey(name);
        if (!key) continue;
        const artist = artists.get(key) || { name, playlists: new Set<string>(), tracks: new Set<string>() };
        artist.playlists.add(playlist.id); artist.tracks.add(`${playlist.id}:${track.id}`); artists.set(key, artist);
      }
    }
  }
  const rank = (rows: Omit<Ranked, 'rank'>[]): Ranked[] => rows.sort((a, b) => b.count - a.count || b.appearances - a.appearances || a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id)).map((row, index) => ({ ...row, rank: index + 1 }));
  return {
    artists: rank([...artists].map(([id, a]) => ({ id, name: a.name, playlists: [...a.playlists], count: a.playlists.size, appearances: a.tracks.size }))),
    tracks: rank([...songs].map(([id, t]) => ({ id, name: t.name, artists: t.artists, playlists: [...t.playlists], count: t.playlists.size, appearances: t.playlists.size }))),
  };
}
export function compare(current: Ranked[], previous: Ranked[], ready: boolean): Ranked[] {
  if (!ready) return current;
  const ranks = new Map(previous.map(row => [row.id, row.rank]));
  return current.map(row => {
    const previousRank = ranks.get(row.id);
    return { ...row, previousRank, change: previousRank ? previousRank - row.rank : undefined,
      newToTop10: row.rank <= 10 && (!previousRank || previousRank > 10) };
  });
}
export function matches(playlist: Playlist, artists: string[], tracks: string[]) {
  const wantedArtists = artists.map(nameKey), wantedTracks = tracks.map(nameKey);
  const foundArtists = new Set<string>(), foundTracks = new Set<string>();
  for (const track of playlist.tracks) {
    for (const artist of track.artists) {
      const key = nameKey(artist);
      if (wantedArtists.includes(key)) foundArtists.add(artist);
    }
    if (wantedTracks.includes(nameKey(track.title))) foundTracks.add(track.title);
  }
  return { artists: [...foundArtists], tracks: [...foundTracks], count: foundArtists.size + foundTracks.size };
}
