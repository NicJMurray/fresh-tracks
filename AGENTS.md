# Working on Fresh Tracks

- This app is `NicJMurray/fresh-tracks`, served at `fresh.njmurray.com`. Read README.md and DEPLOYMENT.md first.
- Preserve the five pinned default seeds in src/catalog.ts unless Nic changes them. Browser additions must not remove defaults.
- Public Spotify embeds are capped previews, not complete playlists. Preserve visible coverage labels, honest freshness wording and the no-history baseline. Never fabricate charts or new-arrival badges.
- Count artists by distinct playlists, breaking ties with track appearances. Count duplicate tracks by Spotify ID once per playlist. Do not split artist names on ordinary commas.
- Keep credentials out of source, frontend assets and output. Discovery uses the existing finder API without copying its protected Google secrets.
- Keep public/ as the explicit public directory. Worker code, migrations, docs, node_modules and local data must never be assets.
- Use npm ci, npm run build and meaningful browser checks for changed flows. Run npm run types after binding changes. Preserve the production D1 database ID and snapshots.
- Apply schema changes through a D1-capable connection before deploying code that depends on them. Normal GitHub deployments publish code/assets and do not administer D1.
- When publishing is authorized, push checked source to main, verify the automatic deployment for that commit and the live custom domain. Clearly document external setup that remains blocked rather than claiming Git automation from a manual upload.
- Update README and DEPLOYMENT when behavior or hosting changes. The homepage repository contains only this app's card/catalog entry.
