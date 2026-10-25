const $ = selector => document.querySelector(selector);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const urlFor = id => `https://open.spotify.com/playlist/${id}`;
const storageKey = 'fresh-tracks:seeds:v1';
const state = { defaults: [], extra: [], data: null, results: [], allArtists: false, allTracks: false, busy: false, searchBusy: false, autoFilled: false };
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
function notice(message = '') { $('#notice').textContent = message; $('#notice').hidden = !message; }
function idFrom(value) {
  if (/^[a-zA-Z0-9]{22}$/.test(value)) return value;
  const uri = value.match(/^spotify:playlist:([a-zA-Z0-9]{22})$/); if (uri) return uri[1];
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'open.spotify.com' && !url.port && !url.username && !url.password ? url.pathname.match(/^\/(?:intl-[a-z-]+\/|embed\/)?playlist\/([a-zA-Z0-9]{22})\/?$/)?.[1] : null; } catch { return null; }
}
function ids() { return [...new Set([...state.defaults.map(s => s.id), ...state.extra])]; }
function save() { try { localStorage.setItem(storageKey, JSON.stringify(state.extra)); } catch { toast('Your browser could not save the seeds. Copy the collection link to keep them.'); } }
function relative(date) {
  const age = Math.max(0, Date.now() - Date.parse(date));
  if (age < 60_000) return 'just now';
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}m ago`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}h ago`;
  return `${Math.floor(age / 86_400_000)}d ago`;
}
function spotifyLink(id, title) { const a = el('a', '', title); a.href = urlFor(id); a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
function cover(image, title) {
  if (!image) return el('span', 'seed-cover cover-fallback', '◎');
  const img = el('img', 'seed-cover'); img.src = image; img.alt = `${title} cover`; img.width = img.height = 44; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => img.replaceWith(el('span', 'seed-cover cover-fallback', '◎')), { once: true }); return img;
}
async function api(path, body) {
  const response = await fetch(`/api/${path}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : { Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(90_000) });
  let data; try { data = await response.json(); } catch { throw new Error('The server returned an unreadable response. Please try again.'); }
  if (!response.ok) throw new Error(data.error || 'The request could not finish. Please try again.'); return data;
}
function renderSeeds() {
  const list = $('#seed-list'); list.replaceChildren();
  const rows = state.data?.playlists || ids().map(id => ({ id, playlist: null }));
  for (const row of rows) {
    const p = row.playlist, fallback = state.defaults.find(s => s.id === row.id), title = p?.title || fallback?.title || 'Added playlist';
    const item = el('li', 'seed-item'); item.append(cover(p?.image, title));
    const info = el('div', 'seed-info'), a = spotifyLink(row.id, title); a.className = 'seed-title'; info.append(a);
    if (p?.owner) info.append(el('p', 'seed-owner', p.owner));
    if (p) {
      info.append(el('p', 'seed-meta', `${p.tracks.length} visible tracks${p.capped ? ' · preview limit' : ''}`));
      info.append(el('p', `seed-meta${p.stale ? ' error' : p.changedAt ? ' changed' : ''}`, p.stale ? `Refresh failed · saved ${relative(p.fetchedAt)}` : p.changedAt ? `Content changed ${relative(p.changedAt)}` : `Checked ${relative(p.fetchedAt)} · baseline`));
      if (p.stale) info.lastChild.title = p.error;
    } else info.append(el('p', row.error ? 'seed-meta error' : 'seed-meta', row.error || 'Reading Spotify preview…'));
    const actions = el('div', 'seed-state');
    if (fallback) actions.append(el('span', 'default-badge', 'Default'));
    else {
      const remove = el('button', 'remove-seed', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${title} from seeds`);
      remove.disabled = state.busy; remove.addEventListener('click', () => { state.extra = state.extra.filter(id => id !== row.id); save(); analyse(); }); actions.append(remove);
    }
    item.append(info, actions); list.append(item);
  }
  $('#seed-count').textContent = ids().length; $('#metric-seeds').textContent = ids().length;
}
function renderRankings() {
  const data = state.data; if (!data) return;
  for (const [kind, rows, all] of [['artist', data.artists, state.allArtists], ['track', data.tracks, state.allTracks]]) {
    const list = $(`#${kind}-list`); list.replaceChildren();
    const shown = all ? rows : rows.slice(0, 10);
    $(`#${kind}-toggle`).textContent = all ? 'Top 10' : `Show all${rows.length > 10 ? ` (${rows.length})` : ''}`;
    $(`#${kind}-toggle`).disabled = rows.length <= 10;
    $(`#${kind}-toggle`).setAttribute('aria-expanded', String(all));
    if (!shown.length) list.append(el('li', 'empty', kind === 'track' ? 'No shared tracks in the visible previews yet. Add more seeds to find the crossover.' : 'Artist overlap will appear when Spotify previews can be read.'));
    for (const row of shown) {
      const item = el('li', 'rank-row'), number = el('span', 'rank-number', String(row.rank).padStart(2, '0')), info = el('div');
      let name;
      if (kind === 'track') { name = el('a', 'rank-name', row.name); name.href = `https://open.spotify.com/track/${row.id}`; name.target = '_blank'; name.rel = 'noopener noreferrer'; }
      else { name = el('span', 'rank-name', row.name); }
      info.append(name);
      if (row.newToTop10) { const badge = el('span', 'new-badge', '✦ NEW IN TOP 10'); badge.title = 'Outside the top ten for the same seeds a week ago'; info.append(el('br'), badge); }
      info.append(el('p', 'rank-detail', kind === 'artist' ? `${row.appearances} track appearance${row.appearances === 1 ? '' : 's'}` : row.artists.join(', ')));
      const reach = el('div', 'reach'), count = el('span', 'reach-count', row.count); count.title = `In ${row.count} of ${data.metrics.readable} readable seeds: ${row.playlists.map(id => data.playlists.find(p => p.id === id)?.playlist?.title || id).join('; ')}`; count.setAttribute('aria-label', `${row.count} playlists`);
      const bar = el('span', 'reach-bar'), fill = el('i'); fill.style.setProperty('--reach', `${row.count / Math.max(1, data.metrics.readable) * 100}%`); bar.setAttribute('aria-hidden', 'true'); bar.append(fill); reach.append(count, bar);
      if (row.change) reach.append(el('span', `rank-move${row.change < 0 ? ' down' : ''}`, `${row.change > 0 ? '↑' : '↓'}${Math.abs(row.change)}`));
      item.append(number, info, reach); list.append(item);
    }
  }
  $('#metric-artists').textContent = data.metrics.artists.toLocaleString();
  $('#metric-tracks').textContent = data.metrics.uniqueTracks.toLocaleString();
  $('#metric-shared').textContent = data.metrics.sharedTracks.toLocaleString();
  $('#history-note').textContent = data.history.message;
  $('#coverage-extra').textContent = data.metrics.capped ? `${data.metrics.capped} seeds reach the preview limit.` : '';
  const valid = data.playlists.flatMap(row => row.playlist ? [row.playlist] : []);
  const oldest = valid.length ? valid.map(p => p.fetchedAt).sort()[0] : null;
  $('#checked-at').textContent = oldest ? `Snapshots from ${relative(oldest)} · daily refresh` : 'No previews available';
}
function useLeaders(force = false) {
  if (!state.data || (state.autoFilled && !force)) return;
  $('#artist-terms').value = state.data.artists.slice(0, 3).map(row => row.name).join('\n');
  $('#track-terms').value = state.data.tracks.slice(0, 3).map(row => row.name).join('\n');
  state.autoFilled = true;
}
async function analyse(refresh = false) {
  if (state.busy) return;
  state.busy = true; document.body.classList.add('busy'); $('#refresh').disabled = true;
  $('#refresh').textContent = 'Reading playlists…'; $('#add-form button').disabled = true;
  $('#seed-list').setAttribute('aria-busy', 'true'); notice(); renderSeeds();
  try {
    const data = await api('analyse', { seeds: state.extra, refresh }); state.data = data;
    renderSeeds(); renderRankings(); useLeaders();
    const failed = data.playlists.filter(row => row.error || row.playlist?.stale);
    if (failed.length) notice(`${failed.length} playlist${failed.length === 1 ? '' : 's'} could not refresh. Saved previews remain labelled; unavailable seeds are excluded from the counts.`);
  } catch (error) { notice(error.message); $('#checked-at').textContent = 'Could not refresh · try again'; }
  finally { state.busy = false; document.body.classList.remove('busy'); $('#refresh').disabled = false; $('#refresh').textContent = '↻ Refresh signals'; $('#add-form button').disabled = false; $('#seed-list').removeAttribute('aria-busy'); renderSeeds(); if (state.results.length) renderResults(); }
}
async function addSeeds(values) {
  if (state.busy) return;
  const parsed = values.map(idFrom); if (!parsed.length || parsed.some(id => !id)) { toast('Paste a valid Spotify playlist link.'); return; }
  const known = ids(), fresh = [...new Set(parsed)].filter(id => !known.includes(id));
  if (!fresh.length) { toast('That playlist is already a seed.'); return; }
  if (known.length + fresh.length > 30) { toast('Keep this collection to 30 playlists. Remove an added seed first.'); return; }
  state.extra.push(...fresh); save(); $('#seed-url').value = ''; await analyse(); renderResults(); toast(`${fresh.length === 1 ? 'Playlist' : `${fresh.length} playlists`} added to your seeds.`);
}
function renderResults() {
  const list = $('#discovery-results'); list.replaceChildren();
  const freshOnly = $('#fresh-only').checked;
  const results = state.results.filter(row => (!freshOnly || row.updateHint || row.changedRecently));
  if (state.results.length && !results.length) { list.append(el('p', 'empty', 'No results have update hints yet. Turn the filter off to see all verified matches.')); return; }
  for (const result of results) {
    const card = el('article', 'result'), top = el('div', 'result-top'), info = el('div'), link = spotifyLink(result.id, result.title); link.className = 'result-title';
    info.append(link, el('p', 'result-owner', result.owner)); top.append(cover(result.image, result.title), info);
    const matched = [...result.matched.artists, ...result.matched.tracks];
    const detail = el('p', 'result-matches', `In the preview: ${matched.join(' · ')}`);
    const update = el('p', result.changedRecently ? 'result-update changed' : 'result-update', result.changedRecently ? `Content changed ${relative(result.changedAt)}` : result.updateHint ? 'Update hint in title or search description · unconfirmed' : 'Update frequency unverified');
    const button = el('button', '', ids().includes(result.id) ? '✓ In your seeds' : '+ Add to seeds'); button.type = 'button'; button.disabled = ids().includes(result.id) || state.busy;
    button.addEventListener('click', async () => { button.disabled = true; await addSeeds([result.id]); }); card.append(top, detail, update, el('p', 'result-update', `${result.visibleTracks} visible tracks${result.capped ? ' · preview limit' : ''}`), button); list.append(card);
  }
}
async function search(event) {
  event.preventDefault(); if (state.searchBusy) return;
  const artists = $('#artist-terms').value.split('\n').map(s => s.trim()).filter(Boolean), tracks = $('#track-terms').value.split('\n').map(s => s.trim()).filter(Boolean);
  if (!artists.length && !tracks.length) { toast('Add an artist or track to search for.'); return; }
  if (artists.length > 3 || tracks.length > 3) { toast('Use up to three artists and three tracks.'); return; }
  state.searchBusy = true; $('#discover-submit').disabled = true; $('#discover-form').setAttribute('aria-busy', 'true'); $('#discovery-status').textContent = 'Finding playlists and checking their visible tracks…';
  try { const data = await api('discover', { artists, tracks, seeds: state.extra }); state.results = data.results; renderResults(); $('#discovery-status').textContent = `${data.results.length} matching playlists from ${data.checked} previews checked.${data.warning ? ` ${data.warning}` : data.results.length ? ' Add a seed to include it in the overlap.' : ' Try fewer or different names; search indexes and public previews can miss matches.'}`; }
  catch (error) { $('#discovery-status').textContent = error.message; }
  finally { state.searchBusy = false; $('#discover-submit').disabled = false; $('#discover-form').removeAttribute('aria-busy'); }
}
$('#refresh').addEventListener('click', () => analyse(true));
$('#add-form').addEventListener('submit', event => { event.preventDefault(); addSeeds($('#seed-url').value.trim().split(/\s+/).filter(Boolean)); });
$('#artist-toggle').addEventListener('click', () => { state.allArtists = !state.allArtists; renderRankings(); });
$('#track-toggle').addEventListener('click', () => { state.allTracks = !state.allTracks; renderRankings(); });
$('#use-leaders').addEventListener('click', () => { useLeaders(true); toast('Search fields now use the current leaders.'); });
$('#discover-form').addEventListener('submit', search); $('#fresh-only').addEventListener('change', renderResults);
$('#share').addEventListener('click', async () => {
  const url = new URL(location.origin); if (state.extra.length) url.searchParams.set('seeds', state.extra.join(','));
  try { await navigator.clipboard.writeText(url.href); toast('Collection link copied. Open it on another device to keep these seeds.'); }
  catch { const input = $('#seed-url'); input.value = url.href; input.focus(); input.select(); toast('Copy the selected collection link.'); }
});
async function init() {
  try {
    const config = await api('config'); state.defaults = config.defaults;
    let stored = []; try { stored = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { /* Start with defaults if browser storage is unavailable. */ }
    const shared = new URL(location.href).searchParams.get('seeds')?.split(',') || [];
    state.extra = [...new Set([...(Array.isArray(stored) ? stored : []), ...shared].filter(v => typeof v === 'string').map(idFrom).filter(Boolean))].filter(id => !state.defaults.some(s => s.id === id)).slice(0, config.maxSeeds - state.defaults.length);
    if (shared.length) { save(); history.replaceState(null, '', location.pathname); }
    renderSeeds(); await analyse();
  } catch (error) { notice(error.message); $('#checked-at').textContent = 'Could not load configuration'; }
}
init();
