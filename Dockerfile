FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --include=optional
COPY . .
ARG VITE_ERGSCAN_SYNC=false
RUN npm run build

FROM nginx:1.31.9-alpine AS web-base
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

# Web image for sync deployments: proxies /api/sync/ to the `sync` service.
FROM web-base AS web-sync
COPY server/nginx-sync.conf /etc/nginx/ergscan-sync/sync.conf

FROM web-base AS web
