FROM node:20-bookworm-slim

WORKDIR /app

# System dependencies for Python planner scripts.
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  python3-pip \
  python3-venv \
  && rm -rf /var/lib/apt/lists/*

# Install JS dependencies first for better layer caching.
# Do not COPY .yarn: this repo uses Corepack + package.json#packageManager (Yarn is not vendored in git).
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable && yarn install --immutable

# Install Python deps in a venv (Debian blocks system-wide pip; PEP 668).
COPY requirements.txt ./
RUN python3 -m venv .venv \
  && .venv/bin/pip install --upgrade pip \
  && .venv/bin/pip install --no-cache-dir -r requirements.txt

# Copy application source and build Next.js app.
COPY . .
RUN yarn build

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

CMD ["sh", "-c", "yarn start -p ${PORT}"]
