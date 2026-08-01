FROM node:20-slim

# 安装 better-sqlite3 编译依赖
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先安装依赖（利用 Docker 层缓存）
COPY package*.json ./
RUN npm ci --omit=dev

# 复制源码并编译
COPY . .
RUN npm run build

# 数据目录
RUN mkdir -p /var/lib/personalac/data
VOLUME ["/var/lib/personalac/data"]

EXPOSE 3000

ENV NODE_ENV=production
ENV DATA_DIR=/var/lib/personalac/data

CMD ["node", "dist/index.js"]
