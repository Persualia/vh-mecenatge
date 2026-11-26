# Imatge de producció: el servidor autònom de Next (output: "standalone").
# Cap secret entra a la imatge: tots arriben com a variables d'entorn en temps d'execució.

FROM node:24-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# L'usuari "node" (1000) de la imatge base: el clúster exigeix runAsNonRoot.
COPY --from=build --chown=1000:1000 /app/.next/standalone ./
COPY --from=build --chown=1000:1000 /app/.next/static ./.next/static
USER 1000
EXPOSE 3000
CMD ["node", "server.js"]
