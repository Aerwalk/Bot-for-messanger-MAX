# ---- Стадия сборки: зависимости бота ----
FROM node:22-slim AS builder

WORKDIR /app

# CA-сертификаты нужны для npm install по HTTPS
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY mini-app/package.json mini-app/package.json
COPY admin-app/package.json admin-app/package.json
COPY bot/package.json bot/package.json

# Платформенные native-бинари (esbuild/tsx) не ставятся через `npm ci` с lockfile,
# созданным на Windows (npm/cli#4828). `npm install` доустанавливает platform-бинари.
RUN npm install --no-audit --no-fund

COPY shared/ shared/
COPY bot/ bot/

# ---- Рантайм ----
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# CA-сертификаты обязательны: без них fetch к API MAX падает

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget \
    && wget -q -O /usr/local/share/ca-certificates/russian_trusted_root_ca_pem.crt \
        https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt \
    && wget -q -O /usr/local/share/ca-certificates/russian_trusted_sub_ca_pem.crt \
        https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt \
    && update-ca-certificates \
    && { printf '\n'; cat /usr/local/share/ca-certificates/russian_trusted_root_ca_pem.crt; printf '\n'; \
         cat /usr/local/share/ca-certificates/russian_trusted_sub_ca_pem.crt; printf '\n'; } \
         > /etc/ssl/certs/russian-trusted.pem \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/russian-trusted.pem

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/bot ./bot

CMD ["node", "--import", "tsx", "bot/src/index.ts"]