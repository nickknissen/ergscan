FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/sync.ts ./server/sync.ts
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8787
CMD ["npm", "run", "sync:serve"]
