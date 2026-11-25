FROM node:24-slim
WORKDIR /app
# The server runs as `node`, so the files it reads must not keep a checkout's owner-only modes.
# `server/` is made first: COPY --chmod would give a directory it creates the same mode, without x.
RUN mkdir server /data && chown node:node /data
COPY --chmod=644 package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chmod=644 server/sync.ts server/check.ts ./server/
USER node
EXPOSE 8787
CMD ["npm", "run", "sync:serve"]
