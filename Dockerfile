FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build

ARG DATABASE_URL

COPY . .

RUN npm run db:generate && npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/scripts/production-env.mjs ./production-env.mjs
COPY --from=build --chown=nextjs:nodejs /app/scripts/standalone-start.mjs ./standalone-start.mjs
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "standalone-start.mjs"]
