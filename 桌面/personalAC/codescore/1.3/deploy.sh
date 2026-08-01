#!/usr/bin/env bash
# PersonalAC v1.3 一键部署脚本
# 使用方式：chmod +x deploy.sh && ./deploy.sh

set -e

echo "==> PersonalAC v1.3 部署"
echo ""

# 检查 .env
if [ ! -f server/.env ]; then
    echo "  创建 server/.env 配置文件..."
    cp server/.env.example server/.env
    echo "  请编辑 server/.env 设置 ENCRYPT_SECRET 等参数后重新运行"
    echo ""
    echo "  最重要的配置项："
    echo "    ENCRYPT_SECRET  - 加密密钥（必须修改）"
    echo "    CORS_ORIGIN     - 前端访问地址"
    exit 1
fi

# 构建前端
echo "==> 构建前端..."
cd frontend
npm ci
npm run build
cd ..

# 构建并启动服务
echo "==> 启动 Docker 服务..."
docker compose up -d --build

echo ""
echo "==> 部署完成"
echo ""
echo "  服务地址：http://localhost"
echo "  API 地址：http://localhost/api"
echo ""
echo "  首次启动请查看日志获取 Sync Token："
echo "    docker compose logs server | grep 'Sync Token'"
echo ""
