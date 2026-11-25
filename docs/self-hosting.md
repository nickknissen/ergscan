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
| `ERGSCAN_SYNC_MAX_BYTES` | `1073741824` (1 GiB) | Total size of all stored snapshots; uploads past it get 507 |
| `ERGSCAN_SYNC_CHECK_USED_PERCENT` | `80` | Storage check: report stored snapshots above this share of the total |
| `ERGSCAN_SYNC_CHECK_NEW_VAULTS` | `10` | Storage check: report more vaults than this created in 24 hours |

## Security headers

The image sends a Content-Security-Policy, `X-Content-Type-Options: nosniff`
and `Referrer-Policy: no-referrer` on every response, from
`nginx-headers.conf`. The policy allows only the app's own origin, plus WASM
compilation for text recognition, `blob:` images for photo previews and
`data:` images for the pairing QR code. No inline scripts or styles, no
`eval`, and the app can't be shown in a frame.

If you serve `dist/` with your own web server, send the same headers. With
nginx, include the file in the `server` block and don't use `add_header` in a
`location`: such a location drops every header it would otherwise inherit. The
shipped config sets `Cache-Control` per path through a `map` for this reason,
and `server/nginx.test.ts` checks it.

## Caching and CDNs

nginx marks `/sw.js`, `/manifest.webmanifest` and `/index.html` as `no-cache`
so installed apps pick up new versions quickly, and the sync API sends
`no-store`. If a CDN sits in front, make sure it respects these headers
instead of applying its own browser cache TTL.

## Operating a sync deployment

Anyone who can reach a sync deployment can create a vault without an account
and store up to 8 MiB in it. The server can't check what it stores, because
it only sees ciphertext. Three things limit the damage.

**Rate limits.** The `web-sync` image's nginx limits the requests that create
something, per client address. Each answers 429 once its burst is used up:

| Request | Rate | Burst |
| --- | --- | --- |
| `POST /api/sync/vault` (new vault) | 1 a minute | 2 |
| `POST /api/sync/pair` (new link invite) and `POST /api/sync/recover`, together | 30 a minute | 10 |

Reading and uploading history, linking polls and deleting are not limited.
nginx can't count per hour, so one address can still create about 60 vaults an
hour; the storage cap is the backstop.

Behind a reverse proxy, nginx sees every request coming from the proxy. The
image takes the client address from `X-Forwarded-For` when the request comes
from `10.0.0.0/8` or `172.16.0.0/12`, the networks Docker usually gives
containers and so the network Coolify's Traefik connects from. Narrow these
`set_real_ip_from` lines in `server/nginx-sync-limits.conf` to your proxy's
network. Anyone who can reach the `web` container from a trusted network can
set the header and choose their address, which skips the per-address limits.
Rootless Docker and Docker's userland proxy make every published-port client
look like the network gateway, so only publish the port on `127.0.0.1` behind
a proxy, as `compose.sync.yml` does.

**Storage cap.** `ERGSCAN_SYNC_MAX_BYTES` caps the total of all stored
snapshots. Past it, uploads get 507 and the app shows that the server is busy,
keeping changes on the device. Size it for your users: with a watch heart-rate
series, one workout is about 15 KiB.

**Storage check.** `npm run sync:check` in the sync container looks for abuse
and exits with 1, printing one line per problem, when:

- stored snapshots pass `ERGSCAN_SYNC_CHECK_USED_PERCENT` of the cap,
- more than `ERGSCAN_SYNC_CHECK_NEW_VAULTS` vaults were created in 24 hours, or
- an upload was refused in the last 24 hours because the server was full.

It exits with 0 and a one-line summary when all is clear, and 2 when it can't
run (no database at `ERGSCAN_SYNC_DB`, or an invalid setting). Run it on a
schedule and alert on failure:

- **Coolify:** add a scheduled task on the `sync` service with the command
  `npm run --silent sync:check`, hourly (`0 * * * *`). Enable a notification
  channel with *Scheduled task failure* turned on, and a tripped check arrives
  there.
- **Compose and cron:**
  `docker compose -f compose.sync.yml exec -T sync npm run --silent sync:check`
  from a cron job that mails or forwards its output when the exit code isn't 0.

Apply a documented retention policy to any database backups. Deleting a vault removes
the live server copy and revokes its credentials. Copies previously downloaded
to other devices and copies in backups follow their own retention.
