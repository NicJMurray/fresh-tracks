# Deployment

- Repository: `NicJMurray/fresh-tracks`
- Production branch: `main`
- Production URL: https://fresh.njmurray.com/
- Worker: `fresh-tracks`
- Static assets: `public/`
- D1: `fresh-tracks`, ID `63b676ba-9719-43c0-bf4c-8f3aec1f8619`
- Configuration: `wrangler.jsonc`
- Build: `npm run build`
- Deploy: `npm run deploy`
- Daily refresh: 04:15 UTC (`15 4 * * *`)

## Publishing status

The Worker, static assets, custom domain, D1 schema and 04:15 UTC daily refresh were deployed on 25 October 2026. The live API successfully read all five defaults (379 visible appearances, 376 distinct tracks, three shared tracks). Desktop and phone browser checks passed for the main flows.

The source is now pushed to `NicJMurray/fresh-tracks` on `main`. Its first GitHub Actions run passed installation and the checked build (including all nine tests), then stopped at **Check deployment access** because the repository secret `CLOUDFLARE_API_TOKEN` is missing. The current GitHub connection cannot manage repository secrets, and the Cloudflare OAuth connection has not granted account API-token management. A manual deployment does not establish Git-triggered publication.

To finish setup, create a token in [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) using the **Edit Cloudflare Workers** template for the deployment account and zone. Add **Account → D1 → Edit**. Store its value directly in [GitHub Actions repository secrets](https://github.com/NicJMurray/fresh-tracks/settings/secrets/actions/new), named `CLOUDFLARE_API_TOKEN`; do not paste it into chat or commit it. Rerun **Deploy Fresh Tracks** after saving it. Once that succeeds, confirm the deployed source commit and custom domain before marking automatic publishing verified.

## GitHub Actions

`.github/workflows/deploy.yml` checks and deploys main-branch pushes. It requires the encrypted repository secret `CLOUDFLARE_API_TOKEN` with Workers Scripts Edit and D1 Edit on account `22c1482ec05957092be7a2df424c4543`. Initial domain provisioning additionally needs Workers Routes / zone access; the configured custom domain must be retained. The workflow fails clearly when the deployment token is absent.

The pipeline installs locked dependencies, runs the checked build, applies pending D1 migrations, then deploys the Worker and static assets. Never place the token in code or public assets. Runtime Spotify or Google credentials are not required for this preview-based version.

For a configured local Wrangler identity:

```sh
npm ci
npm run build
npx wrangler d1 migrations apply fresh-tracks --remote
npm run deploy
```

Verify the exact pushed source commit's successful Actions run, `/api/health`, all five default seed previews at `/api/analyse`, and the custom domain. Preserve the D1 database; deleting it loses observation history. `_headers` applies to static assets; API responses are no-store and expose no credentials.
