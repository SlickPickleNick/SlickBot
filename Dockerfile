FROM node:22-bookworm-slim

WORKDIR /app

# Prisma needs OpenSSL and CA certificates available in the runtime image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# The schema is copied after install for Docker cache efficiency. Skip Prisma's
# package postinstall generation here; npm run build runs prisma generate later.
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

COPY package*.json ./

# Railway can build with NODE_ENV=production. Include dev dependencies because
# TypeScript and Prisma CLI are required during the Docker build.
RUN npm install --include=dev

COPY . .
RUN npm run build

CMD ["npm", "start"]
