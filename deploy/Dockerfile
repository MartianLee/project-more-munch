FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY apps/server/package.json apps/server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY apps/server/ ./
RUN npx prisma generate
RUN pnpm build

FROM node:22-alpine AS runner
RUN corepack enable
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

EXPOSE 19848
CMD ["node", "dist/main"]
