# ---------- build ----------
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- serve ----------
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template

# The API URL is written at container start rather than baked in at build time,
# so the same image can point at localhost, a preview deploy or production
# without a rebuild. See public/config.js for the development default.
COPY docker-entrypoint.sh /docker-entrypoint.d/40-medly-config.sh
RUN chmod +x /docker-entrypoint.d/40-medly-config.sh

ENV PORT=80 \
    MEDLY_API_URL=""

EXPOSE 80
