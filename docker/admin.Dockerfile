FROM node:22-slim AS builder
WORKDIR /app
COPY package.json ./
COPY shared/package.json shared/
COPY admin-app/package.json admin-app/
COPY tsconfig.base.json ./
# npm/cli#4828: lockfile с Windows не несёт Linux-бинари (esbuild/rollup).
# Удаляем его и ставим заново — npm дотащит платформенные optional-пакеты.
RUN rm -f package-lock.json && npm install --no-audit --no-fund --package-lock=false
COPY shared ./shared
COPY admin-app ./admin-app
COPY tsconfig.base.json ./
RUN npm run build -w admin-app

FROM nginx:alpine
COPY docker/nginx-admin.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/admin-app/dist /usr/share/nginx/html
EXPOSE 80