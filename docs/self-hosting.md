# Self-hosting

[← Back to README](../README.md)

ErgScan is a static web app. It runs on any web server, with an optional
sync server for [private sync](private-sync.md).

## Without sync

The `Dockerfile` builds the app without sync and serves it with nginx on
port 80:

```sh
docker build -t ergscan .
docker run -p 8080:80 ergscan
```

Serve it over HTTPS in production: browsers only allow the camera, offline
mode and installing the app on secure origins.

## With private sync

Sync needs the app built with `VITE_ERGSCAN_SYNC=true` and the sync server in
`server/` on the same origin under `/api/sync/`. The server is a small Node.js
API that stores one encrypted history snapshot per vault in SQLite. It never
sees workouts in plain text.

### Docker Compose

```sh
docker compose -f compose.sync.yml up --build -d
```

This builds the `web-sync` image stage, which bundles the app with sync turned
on and adds the nginx rule that proxies `/api/sync/` to the `sync` service.
The stack listens on `127.0.0.1:8080`; serve it through an HTTPS reverse proxy
on one origin. The database lives in a named volume.

### Coolify

`docker-compose.yaml` is the same stack prepared for Coolify: it binds no host
ports, has health checks, and keeps the database in the `ergscan-sync-data`
volume.

1. Create or switch the application to the **Docker Compose** build pack with
   compose file `/docker-compose.yaml`.
2. Click **Reload Compose File**, then assign the domain to the `web` service.
   Without a domain on `web`, the proxy answers 503.
3. Deploy. Pushes to the configured branch redeploy through the webhook.

### Sync server settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `ERGSCAN_SYNC_PORT` | `8787` | Port the server listens on |
| `ERGSCAN_SYNC_HOST` | `127.0.0.1` | Bind address; the Compose files use `0.0.0.0` |
| `ERGSCAN_SYNC_DB` | `ergscan-sync.sqlite` | SQLite file path; the Compose files use `/data/history.sqlite` |

## Security headers

The image sends a Content-Security-Policy, `X-Content-Type-Options: nosniff`
and `Referrer-Policy: no-referrer` on every response, from
`nginx-headers.conf`. The policy allows only the app's own origin, plus WASM
compilation for text recognition, `blob:` images for photo previews and
`data:` images for the pairing QR code. No inline scripts or styles, no
`eval`, and the app can't be shown in a frame.

If you serve `dist/` with your own web server, send the same headers. With
nginx, include the file in the `server` block and in every `location` that has
its own `add_header`, since such a location drops the headers it would
otherwise inherit. `server/nginx.test.ts` checks this for the shipped config.

## Caching and CDNs

nginx marks `/sw.js`, `/manifest.webmanifest` and `/index.html` as `no-cache`
so installed apps pick up new versions quickly, and the sync API sends
`no-store`. If a CDN sits in front, make sure it respects these headers
instead of applying its own browser cache TTL.

## Operating a sync deployment

Configure rate limits and storage monitoring at the deployment, and apply a
documented retention policy to any database backups. Deleting a vault removes
the live server copy and revokes its credentials. Copies previously downloaded
to other devices and copies in backups follow their own retention.
