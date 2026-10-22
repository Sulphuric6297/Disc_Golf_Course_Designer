# HyzerLab: the app built for a server (sign-in) and the server, in one image.
#   docker compose up -d   (see docker-compose.yml and .env.example)

FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json tailwind.config.js postcss.config.js ./
COPY public ./public
COPY src ./src
RUN VITE_SERVER=1 npx vite build

FROM node:22-bookworm-slim AS api
WORKDIR /srv
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 STATIC_DIR=/srv/public
WORKDIR /srv
COPY --from=api /srv/node_modules ./node_modules
COPY --from=api /srv/dist ./dist
COPY --from=api /srv/package.json ./
COPY server/migrations ./migrations
COPY --from=web /app/dist ./public
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/index.js"]
