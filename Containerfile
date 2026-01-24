FROM docker.io/node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml tsconfig.json ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY src ./src

# Build TypeScript
RUN pnpm run build

# Production stage
FROM gcr.io/distroless/nodejs22-debian12:nonroot

WORKDIR /app

# Copy package files
COPY --chown=nonroot:nonroot package.json pnpm-lock.yaml ./

# Copy node_modules from builder
COPY --chown=nonroot:nonroot --from=builder /app/node_modules ./node_modules

# Copy built application from builder
COPY --chown=nonroot:nonroot --from=builder /app/dist ./dist

# Distroless images run as nonroot user by default
# Expose no ports (this is a client application)
EXPOSE 0

CMD ["dist/index.js"]
