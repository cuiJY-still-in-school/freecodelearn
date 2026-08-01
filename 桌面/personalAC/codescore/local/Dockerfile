FROM node:20-slim

# 安装 better-sqlite3 编译依赖
RUN apt-get update && apt-get install -y \
    python3 make g++ sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制 package 文件（利用 layer cache）
COPY package.json package-lock.json ./

# 安装依赖（重新编译 native 模块）
RUN npm ci --ignore-scripts \
    && npm rebuild better-sqlite3

# 复制编译好的产物
COPY dist/ ./dist/
COPY public/ ./public/
COPY bin/ ./bin/

# 数据目录（挂载卷）
VOLUME ["/data"]

ENV PORT=3000
ENV DATA_DIR=/data
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "bin/personalac.js"]
