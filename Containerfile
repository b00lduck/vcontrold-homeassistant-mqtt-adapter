FROM docker.io/node:25-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml tsconfig.json esbuild.config.js ./
COPY src ./src

RUN corepack enable \
    && pnpm install --frozen-lockfile \
    && pnpm run build

FROM gcr.io/distroless/nodejs24-debian13:nonroot

WORKDIR /app
COPY --chown=nonroot:nonroot --from=builder /app/dist/index.js ./dist/index.js
CMD ["dist/index.js"]
