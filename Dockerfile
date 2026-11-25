FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --include=optional
COPY . .
ARG VITE_ERGSCAN_SYNC=false
# COPY keeps the checkout's file modes, so a file only its owner can read (umask 077) would reach
# nginx's worker as 403. Make everything readable, and directories enterable.
RUN npm run build && chmod -R a+rX dist

FROM nginx:1.31.9-alpine AS web-base
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-headers.conf /etc/nginx/snippets/ergscan-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

# Web image for sync deployments: proxies /api/sync/ to the `sync` service.
FROM web-base AS web-sync
COPY server/nginx-sync.conf /etc/nginx/ergscan-sync/sync.conf
# Rate-limit zones and the client address behind a proxy: http context, so conf.d.
COPY server/nginx-sync-limits.conf /etc/nginx/conf.d/ergscan-sync-limits.conf

FROM web-base AS web
