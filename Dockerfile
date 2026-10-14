# syntax=docker/dockerfile:1
# Compose supplies configurable image and user values from the central .env.
ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --prefer-offline --no-audit --no-fund

FROM dependencies AS build
# The Prisma migration engine requires the system OpenSSL libraries.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY . .
# Generate from schema only; generation requires no database credentials.
RUN --mount=type=cache,target=/root/.cache/prisma node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma --config docker/prisma.generate.config.ts
RUN node node_modules/@nestjs/cli/bin/nest.js build
RUN node scripts/licenses.cjs

FROM dependencies AS development
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ARG DOCKER_UID
ARG DOCKER_GID
ARG DOCKER_LOG_DIRECTORY
COPY --chown=${DOCKER_UID}:${DOCKER_GID} . .
RUN --mount=type=cache,target=/root/.cache/prisma node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma --config docker/prisma.generate.config.ts
RUN mkdir -p "${DOCKER_LOG_DIRECTORY}" && chown ${DOCKER_UID}:${DOCKER_GID} /app "${DOCKER_LOG_DIRECTORY}" && chmod 750 "${DOCKER_LOG_DIRECTORY}"
CMD ["node", "node_modules/@nestjs/cli/bin/nest.js", "start", "--watch"]

FROM build AS migration
CMD ["node", "scripts/migrate.cjs"]

FROM dependencies AS runtime-dependencies
RUN npm prune --omit=dev --ignore-scripts

FROM ${NODE_IMAGE} AS production
ARG DOCKER_UID
ARG DOCKER_GID
ARG DOCKER_LOG_DIRECTORY
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --gid ${DOCKER_GID} speckvue && useradd --uid ${DOCKER_UID} --gid speckvue --no-create-home speckvue && mkdir -p "${DOCKER_LOG_DIRECTORY}" && chown ${DOCKER_UID}:${DOCKER_GID} "${DOCKER_LOG_DIRECTORY}" && chmod 750 "${DOCKER_LOG_DIRECTORY}"
COPY --from=runtime-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY scripts/healthcheck.cjs scripts/healthcheck.cjs
COPY package.json LICENSE THIRD_PARTY_NOTICES.md ./
COPY --from=build /app/THIRD_PARTY_LICENSES.txt ./
USER speckvue
CMD ["node", "dist/src/main.js"]
