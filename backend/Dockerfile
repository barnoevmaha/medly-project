# Pinned to 3.13 rather than 3.14 on purpose. On 3.14 several dependencies have
# no prebuilt wheel yet, so pip falls back to compiling pydantic-core with Rust
# — slow at best, and it fails outright when PyO3 does not yet support the
# interpreter. 3.13 has wheels for the whole tree.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Requirements first so the layer caches across code changes.
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# The SQLite file lives here. Mount a volume at /app/data in production or the
# database is discarded on every redeploy.
ENV MEDLY_DATABASE_URL=sqlite:////app/data/medly.db \
    MEDLY_SEED_ON_STARTUP=true
RUN mkdir -p /app/data

# The server runs as a non-root user; the data directory has to be writable by
# it. There is no `USER medly` here on purpose: a mounted volume arrives owned
# by root, so the entrypoint starts as root, hands /app/data to medly, and
# drops privileges before exec-ing the CMD. setpriv ships with util-linux in
# the base image.
RUN useradd --create-home --uid 1000 medly && chown -R medly:medly /app \
    && chmod +x /app/docker-entrypoint.sh && command -v setpriv
ENTRYPOINT ["/app/docker-entrypoint.sh"]

EXPOSE 8000

# Railway, Render and Fly all inject $PORT. Falling back to 8000 keeps
# `docker run` working locally without extra flags.
#
# The `sh -c` form is load-bearing. An exec-form CMD passes arguments straight
# to the binary with no shell, so uvicorn would receive the literal string
# "$PORT" and refuse to parse it as an integer. For the same reason, do not put
# a `startCommand` containing $PORT in railway.json — it overrides this line and
# reintroduces the bug.
#
# --forwarded-allow-ips '*' makes uvicorn take the client address from
# X-Forwarded-For. Without it every request appears to come from the platform's
# proxy, and the per-IP login limit becomes one bucket shared by every user.
# uvicorn takes the header's *first* entry, which a client can write itself;
# set MEDLY_PROXY_SECRET (on this service and the web service) and the login
# limit uses an address the client cannot forge — see client_ip() in
# app/security.py.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips '*'"]
