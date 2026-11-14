FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm ci --ignore-scripts
# Build without database credentials. The API is private to this container.
ENV CONTAINER_BUILD=true
ENV INTERNAL_API_URL=http://127.0.0.1:3001
RUN npm run build

FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/cloudflare/package.json ./apps/cloudflare/package.json
COPY --from=build /app/packages/database/package.json ./packages/database/package.json
COPY --from=build /app/packages/api-client/package.json ./packages/api-client/package.json
RUN npm ci --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
ENV API_PORT=3001
ENV INTERNAL_API_URL=http://127.0.0.1:3001
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --chown=node:node scripts/start-container.mjs ./scripts/start-container.mjs
USER node
EXPOSE 8080
CMD ["node", "scripts/start-container.mjs"]
