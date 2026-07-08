FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_PROGRESS=false \
    NPM_CONFIG_REGISTRY=https://registry.npmjs.org/

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --prefer-online --no-audit --no-fund --loglevel=warn

COPY . .

CMD ["node", "src/index.js"]
