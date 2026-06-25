# syntax=docker/dockerfile:1.7
#
# LexiTech backend — multi-stage image.
# Stage 1 builds a venv; stage 2 is a slim runtime with a non-root user.
# Health check hits /health, matching the FastAPI endpoint.

ARG PYTHON_VERSION=3.11


# --- Stage 1: builder -------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim AS builder

WORKDIR /build

# build-essential is required for any wheels that compile C extensions.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create an isolated venv so the runtime stage can copy it whole.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Copy ONLY the dependency manifest first for maximum layer cache reuse.
COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt


# --- Stage 2: runtime -------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim AS runtime

# tini reaps zombies and forwards signals — required for clean shutdown.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tini \
    && rm -rf /var/lib/apt/lists/*

# Unprivileged user (uid 1001) with a fixed group.
RUN groupadd --system --gid 1001 lexitech \
    && useradd --system --uid 1001 --gid lexitech --no-create-home --shell /sbin/nologin lexitech

WORKDIR /app

# Copy the venv from the builder.
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1

# Copy the application source.
COPY --chown=lexitech:lexitech . /app

USER lexitech

EXPOSE 8000

# Container-level health probe — orchestrators and `docker compose ps` use this.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=3).read()" \
    || exit 1

# tini as PID 1 for proper signal forwarding on `docker stop`.
ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
