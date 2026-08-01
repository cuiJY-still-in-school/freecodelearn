# ── Stage 1: 构建前端 ────────────────────────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci --prefer-offline
COPY frontend/ ./
RUN npm run build

# ── Stage 2: 编译服务端 ──────────────────────────────────────────────
FROM node:20-slim AS server-build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /build/server
COPY server/package*.json ./
RUN npm ci --prefer-offline
COPY server/ ./
RUN npm run build
# 删除 devDependencies 源码，只保留生产依赖
RUN npm ci --omit=dev --prefer-offline

# ── 最终镜像 ─────────────────────────────────────────────────────────
FROM node:20-slim
WORKDIR /app

# 只复制生产依赖（已在 server-build 里裁剪好）
COPY --from=server-build /build/server/node_modules ./node_modules
COPY --from=server-build /build/server/package*.json ./
COPY --from=server-build /build/server/dist ./dist
COPY --from=frontend     /build/frontend/dist ./public

RUN mkdir -p /data

VOLUME ["/data"]

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV FRONTEND_DIST=/app/public
ENV PORT=7575

EXPOSE 7575
# 显式指定最大堆，避免容器 OOM
CMD ["node", "--max-old-space-size=512", "dist/index.js"]
