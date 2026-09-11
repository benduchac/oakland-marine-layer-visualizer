# Oakland Marine Layer Visualizer

<img width="3200" height="1542" alt="image" src="https://github.com/user-attachments/assets/4ed5f890-0838-49e1-a8ee-9b37edbfd1cc" />

A web app that shows whether the Oakland/Berkeley hills are above or below
the marine layer at a given time, so you can tell whether a hike will be in
fog or in sun. Uses the actual KOAK radiosonde inversion height from the
~12Z (5am local) launch, projected as a flat plane against terrain
elevation — below the plane = in the marine layer, above = clear.

A second mode (**Forecast/HRRR grid** — a spatial coverage-percent overlay
sampled from NWS gridpoint data) exists in the code but is hidden behind a
dev-only toggle for now: it's a much harder surface to verify (which model
run, which forecast hour, etc.) than the sounding, which can be checked
against a real historical observation any time via the dev sounding picker.
It isn't triggered in production, but the route still works for manual/dev
testing.

See [`marine-layer-spec.md`](./marine-layer-spec.md) for the full design spec.

## Stack

Next.js (App Router) + Mapbox GL JS, Vercel Serverless Functions for the two
data pipelines, Vercel Blob for storage (falls back to local JSON files under
`.data/` when no Blob store is configured).

The sounding fetch is triggered by a GitHub Actions schedule
([`.github/workflows/fetch-sounding.yml`](./.github/workflows/fetch-sounding.yml)),
not Vercel Cron — Hobby-tier Vercel cron jobs only have ±59min scheduling
precision, which isn't tight enough for "fresh data before a pre-dawn
departure." The workflow sweeps 12:15–13:00 UTC every 5 minutes, since the
12Z KOAK sounding's actual posting time to the archive isn't pinned down
precisely (observed as late as 12:43Z on one real morning).

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in NEXT_PUBLIC_MAPBOX_TOKEN at minimum
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The map won't render
without a Mapbox access token — get one at
[account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens/).

To populate data locally, hit the cron routes directly:

```bash
curl http://localhost:3000/api/cron/fetch-sounding
curl http://localhost:3000/api/cron/fetch-hrrr-proxy
```

## Deploying

Link the project to Vercel and set the env vars from `.env.local.example`
(a Blob store's `BLOB_READ_WRITE_TOKEN` is provisioned automatically when
attached in the Vercel dashboard). The GitHub Actions workflow starts
running on its schedule once it's on the default branch — no extra setup
needed unless `CRON_SECRET` is set in Vercel, in which case the workflow's
`curl` call needs an `Authorization: Bearer` header added, sourced from a
matching GitHub Actions secret.
