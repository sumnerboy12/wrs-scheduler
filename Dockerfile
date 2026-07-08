# syntax=docker/dockerfile:1

# ---- Build the React client ----
FROM node:24-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Runtime image: Express API + built client, one process/port ----
FROM node:24-alpine
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist

ENV PORT=4000
EXPOSE 4000
# SQLite data file lives here — mount a host volume over this path so data
# survives image rebuilds/updates.
VOLUME ["/app/server/data"]

CMD ["node", "src/index.js"]
