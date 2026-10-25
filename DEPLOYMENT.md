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

Automatic publication was verified on 25 October 2026. Pushing commit `ac41310ccb0f5a53fa98d890b6e2ea2985351d9a` to `main` triggered [a successful GitHub Actions deployment](https://github.com/NicJMurray/fresh-tracks/actions/runs/40175849315). Its build passed all nine tests. Cloudflare deployed Worker version `0419c2d8-ae17-4be5-a93e-4aa5da771652`, tagged with that exact Git commit; the custom domain served the matching version and assets, and all five default seeds were readable.

`CLOUDFLARE_API_TOKEN` is stored as an encrypted GitHub repository secret. Routine main-branch pushes publish the checked Worker and static assets. The database is already provisioned, and normal deployments retain its existing binding without administering the database. Apply future schema changes separately through a D1-capable connection before publishing code that depends on them.

## GitHub Actions

`.github/workflows/deploy.yml` checks and deploys main-branch pushes. It requires the encrypted repository secret `CLOUDFLARE_API_TOKEN` with Workers Scripts Edit on account `22c1482ec05957092be7a2df424c4543`. Initial domain provisioning additionally needs Workers Routes / zone access; the configured custom domain must be retained. The workflow fails clearly when the deployment token is absent.

The pipeline installs locked dependencies, runs the checked build, then deploys the Worker and static assets. Schema changes are separate: apply the relevant migration files through a D1-capable Cloudflare connection (or Wrangler with D1 Edit) before deploying code that needs those changes. The initial schema is already installed. CI does not need permission to query or modify the database merely to retain its existing Worker binding. Never place the token in code or public assets. Runtime Spotify or Google credentials are not required for this preview-based version.

For a configured local Wrangler identity:

```sh
npm ci
npm run build
npx wrangler d1 migrations apply fresh-tracks --remote
npm run deploy
```

Verify the exact pushed source commit's successful Actions run, `/api/health`, all five default seed previews at `/api/analyse`, and the custom domain. Preserve the D1 database; deleting it loses observation history. `_headers` applies to static assets; API responses are no-store and expose no credentials.
