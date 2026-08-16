# ---- Frontend build ----
FROM node:22-slim AS frontend
WORKDIR /app/frontend
# node:22-slim's bundled npm is old enough to mishandle optional platform
# packages (esbuild's per-OS binaries) in a lockfile written by a newer npm —
# it tries to install ones for the wrong OS/arch instead of skipping them
# (EBADPLATFORM), aborting `npm ci` outright. Matching npm's major version to
# what generates the lockfile avoids the mismatch.
RUN npm install -g npm@11
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Baked into the service worker at build time; only used once media moves to a
# CDN origin. Empty means "same origin", which is the current setup.
ARG VITE_MEDIA_ORIGIN=""
ENV VITE_MEDIA_ORIGIN=$VITE_MEDIA_ORIGIN
RUN npm run build

# ---- Runtime ----
# Debian (glibc) rather than Alpine: sharp ships prebuilt binaries with bundled
# libvips for glibc, so there is no native build step here.
FROM node:22-slim AS runtime
ENV NODE_ENV=production

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./

# app.js resolves the SPA at ../../frontend/dist — keep the layout intact.
COPY --from=frontend /app/frontend/dist /app/frontend/dist

# node:22-slim ships a pre-created, unprivileged `node` user (uid 1000) for
# exactly this. Nothing under /app is written at runtime — media goes to R2
# or to the /data volume mount, never to the image's own filesystem — so no
# chown is needed here; npm's default file modes already leave node_modules
# world-readable.
USER node

EXPOSE 4000
CMD ["node", "src/app.js"]
