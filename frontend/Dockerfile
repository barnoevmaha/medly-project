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
# Files keep the permissions they had on the machine that sent the build
# context. `railway up` uploads straight from a laptop, where an asset saved
# as 600 is unreadable by the nginx worker and served as 403 — the logo was.
RUN chmod -R a+rX /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template

# The API URL is written at container start rather than baked in at build time,
# so the same image can point at localhost, a preview deploy or production
# without a rebuild. See public/config.js for the development default.
COPY docker-entrypoint.sh /docker-entrypoint.d/40-medly-config.sh
# Runs before the template render (20-envsubst-on-templates.sh); an .envsh is
# only sourced when executable.
COPY 18-medly-api.envsh /docker-entrypoint.d/18-medly-api.envsh
RUN chmod +x /docker-entrypoint.d/40-medly-config.sh /docker-entrypoint.d/18-medly-api.envsh

# MEDLY_API_URL empty = call the API on this same origin, through the /api/
# proxy above. Set it only to bypass the proxy and call an API elsewhere.
ENV PORT=80 \
    MEDLY_API_URL="" \
    MEDLY_API_UPSTREAM="" \
    MEDLY_PROXY_SECRET=""

EXPOSE 80
