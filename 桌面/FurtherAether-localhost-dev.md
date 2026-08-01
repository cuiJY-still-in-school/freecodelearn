# FurtherAether — Localhost 开发版文档

> **目标**：在本机跑通完整功能，验证核心逻辑，不涉及任何公网、域名、SSL、Cloudflare。
> 全部服务跑在 `localhost`，手机App暂时用浏览器模拟，打包发布留到验证完再说。

---

## 服务端口分配

| 服务 | 地址 |
|------|------|
| FastAPI 服务器 | http://localhost:8000 |
| Agent Core（WebSocket） | ws://localhost:8000/ws |
| Platform 前端 | http://localhost:3000 |
| Pay 页面 | http://localhost:3001 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

---

## 环境准备

```bash
# Kali 上确认已安装
python3 --version    # 需要 3.11+
node --version       # 需要 18+
docker --version
docker compose version

# 如果 Python 版本不够
sudo apt install python3.11 python3.11-venv -y

# 如果没有 Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
sudo apt install nodejs -y
```

---

## 阶段 0 — 项目初始化

```bash
mkdir furtheraether && cd furtheraether
mkdir server agent-core desktop-ui mobile-app platform

# 服务器 Python 环境
cd server
python3.11 -m venv .venv
source .venv/bin/activate
pip install fastapi "uvicorn[standard]" asyncpg "sqlalchemy[asyncio]" \
    alembic "redis[asyncio]" "python-jose[cryptography]" \
    "passlib[bcrypt]" httpx "pydantic-settings" loguru sentry-sdk \
    apscheduler cryptography
cd ..
```

---

## 阶段 1 — 数据库启动

**`server/docker-compose.dev.yml`：**

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: furtheraether
      POSTGRES_USER: fa
      POSTGRES_PASSWORD: fa_dev_123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

```bash
cd server
docker compose -f docker-compose.dev.yml up -d
# 验证
docker compose -f docker-compose.dev.yml ps
```

**验收：** postgres 和 redis 均显示 Up

---

## 阶段 2 — 服务器配置

**`server/.env.dev`：**

```bash
# 数据库
DATABASE_URL=postgresql+asyncpg://fa:fa_dev_123@localhost:5432/furtheraether
REDIS_URL=redis://localhost:6379/0

# JWT（开发用，随便填）
JWT_SECRET=dev_jwt_secret_change_in_production
ADMIN_JWT_SECRET=dev_admin_jwt_secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=120
REFRESH_TOKEN_EXPIRE_DAYS=30

# 管理员（开发阶段直接用固定验证码跳过邮件）
ADMIN_EMAIL=admin@localhost
ADMIN_DEV_CODE=123456          # 开发模式固定验证码，不真正发邮件

# 上游模型（填真实Key，或者先用Mock模式）
DEEPSEEK_API_KEY=               # 填你的Key，或留空走Mock
QWEN_API_KEY=
MOONSHOT_API_KEY=
ZHIPUAI_API_KEY=

# Key 加密
KEY_ENCRYPTION_SECRET=ZmFrZWtleWZvcmRldmVsb3BtZW50b25seQ==

# 套餐限额
LUNA_TOKEN_LIMIT=3000000
SOL_TOKEN_LIMIT=10000000
ORION_TOKEN_LIMIT=15000000

# 应用
APP_VERSION=0.1.0-dev
ENV=development
DEBUG=true
SENTRY_DSN=                    # 开发阶段留空
```

---

## 阶段 3 — 服务器目录结构

```bash
cd server
mkdir -p routers ws upstream db utils bot
touch main.py config.py
touch routers/__init__.py routers/auth.py routers/inference.py routers/quota.py routers/admin.py
touch ws/__init__.py ws/connection_manager.py ws/ws_agent.py ws/ws_mobile.py ws/ws_bot.py
touch upstream/__init__.py upstream/router.py upstream/key_manager.py
touch db/__init__.py db/database.py db/models.py db/crud.py
touch utils/__init__.py utils/auth.py utils/quota.py utils/billing.py utils/crypto.py utils/metrics.py
```

---

## 阶段 4 — 数据库模型与迁移

**`server/db/database.py`：**

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
```

**`server/db/models.py`：**

```python
import uuid
from sqlalchemy import Column, String, BigInteger, Integer, Float, DateTime, Boolean, Text, JSON
from sqlalchemy.sql import func
from db.database import Base

def gen_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"
    id               = Column(String, primary_key=True, default=gen_uuid)
    email            = Column(String, unique=True, nullable=False, index=True)
    password_hash    = Column(String, nullable=False)
    plan             = Column(String, default="free")   # free | luna | sol | orion
    billing_cycle    = Column(String, default="monthly") # weekly | monthly | yearly
    free_tier_choice = Column(String, default="sol")
    is_active        = Column(Boolean, default=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at    = Column(DateTime(timezone=True))

class QuotaUsage(Base):
    __tablename__ = "quota_usage"
    id            = Column(Integer, primary_key=True, autoincrement=True)
    user_id       = Column(String, index=True)
    period_key    = Column(String)       # '2026-03' or '2026-W12' or '2026'
    input_tokens  = Column(BigInteger, default=0)
    output_tokens = Column(BigInteger, default=0)
    updated_at    = Column(DateTime(timezone=True), onupdate=func.now())

class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"
    token_hash = Column(String, primary_key=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)

class ApiKey(Base):
    __tablename__ = "api_keys"
    id            = Column(String, primary_key=True, default=gen_uuid)
    provider      = Column(String, nullable=False)
    label         = Column(String, nullable=False)
    key_value     = Column(String, nullable=False)   # 加密存储
    is_active     = Column(Boolean, default=True)
    priority      = Column(Integer, default=0)
    balance_cny   = Column(Float)
    error_count   = Column(Integer, default=0)
    last_used_at  = Column(DateTime(timezone=True))
    note          = Column(Text)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

class Order(Base):
    __tablename__ = "orders"
    id             = Column(String, primary_key=True, default=gen_uuid)
    user_id        = Column(String, index=True)
    plan           = Column(String, nullable=False)
    cycle          = Column(String)
    addon_type     = Column(String)
    amount_fen     = Column(Integer, nullable=False)
    status         = Column(String, default="pending")
    payment_method = Column(String)
    trade_no       = Column(String, unique=True)
    paid_at        = Column(DateTime(timezone=True))
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
    expires_at     = Column(DateTime(timezone=True), nullable=False)

class AdminLog(Base):
    __tablename__ = "admin_logs"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    admin_id   = Column(String, nullable=False)
    action     = Column(String, nullable=False)
    target     = Column(JSON)
    ip         = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

**`server/config.py`：**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str
    JWT_SECRET: str
    ADMIN_JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ADMIN_EMAIL: str
    ADMIN_DEV_CODE: str = ""       # 开发模式固定验证码
    DEEPSEEK_API_KEY: str = ""
    QWEN_API_KEY: str = ""
    MOONSHOT_API_KEY: str = ""
    ZHIPUAI_API_KEY: str = ""
    KEY_ENCRYPTION_SECRET: str
    LUNA_TOKEN_LIMIT: int = 3_000_000
    SOL_TOKEN_LIMIT: int = 10_000_000
    ORION_TOKEN_LIMIT: int = 15_000_000
    APP_VERSION: str = "0.1.0-dev"
    ENV: str = "development"
    DEBUG: bool = True
    SENTRY_DSN: str = ""
    FREE_DAILY_TASK_LIMIT: int = 3

    class Config:
        env_file = ".env.dev"

settings = Settings()
```

**初始化数据库：**

```bash
cd server
source .venv/bin/activate
python3 -c "
import asyncio
from db.database import init_db
asyncio.run(init_db())
print('DB tables created')
"
```

**验收：** 无报错，psql 里能看到所有表

---

## 阶段 5 — JWT 与认证工具

**`server/utils/auth.py`：**

```python
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config import settings
import redis.asyncio as aioredis
import random, string

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()
redis_client  = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(user_id: str, plan: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": user_id, "plan": plan, "type": "access", "exp": expire},
        settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )

def create_refresh_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": user_id, "type": "refresh", "exp": expire},
        settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )

def create_admin_token(admin_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=30)
    return jwt.encode(
        {"sub": admin_id, "role": "admin", "exp": expire},
        settings.ADMIN_JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )

async def verify_jwt(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET,
                             algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type")
        return payload
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token invalid or expired")

async def verify_admin_jwt(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    try:
        payload = jwt.decode(credentials.credentials, settings.ADMIN_JWT_SECRET,
                             algorithms=[settings.JWT_ALGORITHM])
        if payload.get("role") != "admin":
            raise HTTPException(403, "Not an admin token")
        return payload
    except JWTError:
        raise HTTPException(401, "Invalid admin token")

async def send_admin_code(email: str) -> str:
    if email != settings.ADMIN_EMAIL:
        raise HTTPException(403, "Not authorized admin email")

    # 开发模式：固定验证码，不发邮件
    if settings.ENV == "development" and settings.ADMIN_DEV_CODE:
        code = settings.ADMIN_DEV_CODE
        print(f"[DEV] Admin verification code: {code}")
    else:
        code = ''.join(random.choices(string.digits, k=6))
        # TODO 生产环境：用 SMTP 发邮件

    await redis_client.setex(f"admin_code:{email}", 300, code)
    return code

async def verify_admin_code(email: str, code: str) -> str:
    if email != settings.ADMIN_EMAIL:
        raise HTTPException(403, "Not authorized admin email")
    stored = await redis_client.get(f"admin_code:{email}")
    if not stored or stored != code:
        raise HTTPException(401, "验证码错误或已过期")
    await redis_client.delete(f"admin_code:{email}")
    return create_admin_token(email)
```

---

## 阶段 6 — 认证路由

**`server/routers/auth.py`：**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from db.database import get_db
from db.models import User
from utils.auth import (hash_password, verify_password, create_access_token,
                        create_refresh_token, send_admin_code, verify_admin_code)
from sqlalchemy import select
import uuid

router = APIRouter()

class RegisterRequest(BaseModel):
    email: str
    password: str
    plan: str = "free"

class LoginRequest(BaseModel):
    email: str
    password: str

class AdminCodeRequest(BaseModel):
    email: str

class AdminVerifyRequest(BaseModel):
    email: str
    code: str

@router.post("/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Email already registered")
    user = User(
        id=str(uuid.uuid4()),
        email=req.email,
        password_hash=hash_password(req.password),
        plan=req.plan,
    )
    db.add(user)
    await db.commit()
    return {"user_id": user.id, "email": user.email, "plan": user.plan}

@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    return {
        "access_token":  create_access_token(user.id, user.plan),
        "refresh_token": create_refresh_token(user.id),
        "user_id":       user.id,
        "plan":          user.plan,
    }

@router.post("/admin/send-code")
async def admin_send_code(req: AdminCodeRequest):
    await send_admin_code(req.email)
    return {"message": "验证码已发送（开发模式请查看终端输出）"}

@router.post("/admin/verify")
async def admin_verify(req: AdminVerifyRequest):
    token = await verify_admin_code(req.email, req.code)
    return {"access_token": token, "role": "admin"}
```

---

## 阶段 7 — 推理代理路由（Mock 模式）

开发阶段如果没有真实 API Key，可以开启 Mock 模式返回假数据，不消耗 token。

**`server/upstream/router.py`：**

```python
import httpx
from config import settings

UPSTREAM_CONFIG = {
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "api_key":  settings.DEEPSEEK_API_KEY,
    },
    "qwen": {
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "api_key":  settings.QWEN_API_KEY,
    },
    "moonshot": {
        "base_url": "https://api.moonshot.ai/v1",
        "api_key":  settings.MOONSHOT_API_KEY,
    },
    "zhipuai": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "api_key":  settings.ZHIPUAI_API_KEY,
    },
    "fa_private": {
        "base_url": "http://localhost:11435/v1",
        "api_key":  "ollama",
    },
    "mock": {
        "base_url": None,
        "api_key":  None,
    },
}

MOCK_RESPONSE = {
    "choices": [{
        "message": {
            "role": "assistant",
            "content": '[{"description":"列出桌面文件","tool":"file","params":{"action":"list","path":"~/Desktop"},"confidence":0.95,"risk_level":"low","requires_human":false,"reason_if_uncertain":""}]'
        }
    }],
    "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}
}

async def route_to_upstream(provider: str, model: str, payload: dict) -> dict:
    # Mock 模式（API Key 为空时自动启用）
    cfg = UPSTREAM_CONFIG.get(provider, {})
    if not cfg.get("api_key") or provider == "mock":
        print(f"[MOCK] provider={provider} model={model}")
        return MOCK_RESPONSE

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{cfg['base_url']}/chat/completions",
            headers={"Authorization": f"Bearer {cfg['api_key']}",
                     "Content-Type": "application/json"},
            json={"model": model, **payload},
        )
        resp.raise_for_status()
        return resp.json()
```

**`server/routers/inference.py`：**

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from utils.auth import verify_jwt
from upstream.router import route_to_upstream
from config import settings

router = APIRouter()

PLAN_ALLOWLIST = {
    "free":  {"deepseek-chat", "qwen3.5-plus", "qwen3.5-flash"},
    "luna":  {"deepseek-chat", "qwen3.5-plus", "qwen3.5-flash", "qwen3-max"},
    "sol":   {"deepseek-chat", "deepseek-reasoner", "qwen3.5-plus", "qwen3.5-flash", "qwen3-max"},
    "orion": {"deepseek-chat", "deepseek-reasoner", "qwen3.5-plus", "qwen3.5-flash",
              "qwen3-max", "kimi-k2.5", "glm-5", "glm-5-turbo"},
}

class InferenceRequest(BaseModel):
    provider: str
    model: str
    messages: list
    max_tokens: int = 4096
    temperature: float = 0.0

@router.post("/inference")
async def inference(req: InferenceRequest, user=Depends(verify_jwt)):
    plan = user.get("plan", "free")

    # Free 档：检查每日任务次数（暂时跳过，后续完善）
    if plan not in PLAN_ALLOWLIST:
        plan = "free"
    if req.model not in PLAN_ALLOWLIST[plan]:
        raise HTTPException(403, f"{req.model} 不在 {plan} 套餐内")

    result = await route_to_upstream(req.provider, req.model, {
        "messages":    req.messages,
        "max_tokens":  req.max_tokens,
        "temperature": req.temperature,
    })
    return result
```

---

## 阶段 8 — 主入口与启动

**`server/main.py`：**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from db.database import init_db
from routers import auth, inference
from loguru import logger

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("FurtherAether dev server started")
    yield

app = FastAPI(title="FurtherAether API", version="0.1.0-dev", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix="/auth",  tags=["认证"])
app.include_router(inference.router, prefix="/v1",    tags=["推理"])

@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0-dev", "env": "development"}
```

**启动服务器：**

```bash
cd server
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

**验收清单：**

```bash
# 健康检查
curl http://localhost:8000/health

# 注册用户
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456","plan":"sol"}'

# 登录
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456"}'

# 复制返回的 access_token，测试推理（Mock模式）
curl -X POST http://localhost:8000/v1/inference \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{"provider":"mock","model":"deepseek-chat","messages":[{"role":"user","content":"测试"}]}'

# 管理员发验证码（终端会打印验证码）
curl -X POST http://localhost:8000/auth/admin/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost"}'
```

所有请求返回正常 → 服务器基础功能完成 ✅

---

## 阶段 9 — Agent Core（本地执行引擎）

```bash
cd agent-core
python3.11 -m venv .venv
source .venv/bin/activate
pip install websockets sqlmodel playwright httpx pydantic loguru watchdog aiofiles

playwright install chromium
mkdir -p modules tools utils models config prompts tests
```

**`agent-core/.env.dev`：**

```bash
FA_API_BASE=http://localhost:8000
FA_WS_BASE=ws://localhost:8000/ws
FA_ACCESS_TOKEN=          # 登录后填入
FA_USER_ID=               # 登录后填入
FA_PLAN=sol
SANDBOX_ROOT=~/Documents/AgentWorkspace
HITL_CONFIDENCE_THRESHOLD=0.75
```

**`agent-core/config.py`：**

```python
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(".env.dev")

FA_API_BASE  = os.getenv("FA_API_BASE", "http://localhost:8000")
FA_WS_BASE   = os.getenv("FA_WS_BASE",  "ws://localhost:8000/ws")
FA_ACCESS_TOKEN = os.getenv("FA_ACCESS_TOKEN", "")
SANDBOX_ROOT = Path(os.getenv("SANDBOX_ROOT", "~/Documents/AgentWorkspace")).expanduser()
HITL_CONFIDENCE_THRESHOLD = float(os.getenv("HITL_CONFIDENCE_THRESHOLD", "0.75"))

# 确保工作目录存在
SANDBOX_ROOT.mkdir(parents=True, exist_ok=True)
```

---

## 阶段 10 — 最小可跑通的任务流

先跑通最简单的任务：**用户提交任务 → AI 规划 → 文件工具执行 → 返回结果**，不含 WebSocket，用 HTTP 轮询验证逻辑。

**`agent-core/tools/file_tool.py`：**

```python
from pathlib import Path
from config import SANDBOX_ROOT

ALLOWED_PATHS = [
    Path.home() / "Desktop",
    Path.home() / "Downloads",
    Path.home() / "Documents",
    SANDBOX_ROOT,
]

def is_allowed(path: Path) -> bool:
    path = path.expanduser().resolve()
    return any(path == p.resolve() or p.resolve() in path.parents
               for p in ALLOWED_PATHS)

async def execute(params: dict) -> dict:
    action = params.get("action")
    path   = Path(params.get("path", "")).expanduser()

    if not is_allowed(path):
        return {"success": False, "error": f"路径不在允许范围内: {path}"}

    if action == "list":
        if not path.exists():
            return {"success": False, "error": f"路径不存在: {path}"}
        files = [{"name": f.name, "type": "dir" if f.is_dir() else "file",
                  "size": f.stat().st_size if f.is_file() else None}
                 for f in path.iterdir()]
        return {"success": True, "output": files}

    if action == "read":
        if not path.exists():
            return {"success": False, "error": "文件不存在"}
        return {"success": True, "output": path.read_text(encoding="utf-8", errors="ignore")}

    if action == "write":
        path.write_text(params.get("content", ""), encoding="utf-8")
        return {"success": True, "output": f"已写入 {path}"}

    if action == "mkdir":
        path.mkdir(parents=True, exist_ok=True)
        return {"success": True, "output": f"目录已创建 {path}"}

    return {"success": False, "error": f"未知 action: {action}"}
```

**`agent-core/modules/ai_dispatcher.py`：**

```python
import httpx, json, re
from config import FA_API_BASE, FA_ACCESS_TOKEN

PLANNER_SYSTEM = """
你是 FurtherAether 的任务规划引擎。将用户指令拆解成有序子任务列表。
只输出 JSON 数组，禁止任何解释或 markdown 代码块。

每个子任务结构：
{
  "description": "一句话描述",
  "tool": "file" | "browser" | "shell" | "android",
  "params": {},
  "confidence": 0.0到1.0,
  "risk_level": "low" | "medium" | "high",
  "requires_human": true或false,
  "reason_if_uncertain": ""
}

当前可用工具：
- file: list（列目录）、read（读文件）、write（写文件）、mkdir（建目录）
- browser: navigate、click、type、screenshot、extract_text
- shell: 安全的终端命令
"""

def parse_json_output(raw: str) -> list:
    cleaned = re.sub(r"```(?:json)?\s*|```", "", raw).strip()
    start = cleaned.find("[")
    end   = cleaned.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError(f"无法解析 JSON: {raw[:200]}")
    return json.loads(cleaned[start:end])

async def plan_task(user_input: str) -> list:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{FA_API_BASE}/v1/inference",
            headers={"Authorization": f"Bearer {FA_ACCESS_TOKEN}",
                     "Content-Type": "application/json"},
            json={
                "provider": "deepseek",
                "model":    "deepseek-chat",
                "messages": [
                    {"role": "system", "content": PLANNER_SYSTEM},
                    {"role": "user",   "content": user_input},
                ],
                "max_tokens": 2048,
                "temperature": 0.0,
            }
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return parse_json_output(content)
```

**`agent-core/run_task.py`（快速测试脚本）：**

```python
import asyncio
from modules.ai_dispatcher import plan_task
from tools.file_tool import execute as file_execute

async def main():
    user_input = input("输入任务：")

    print("\n📋 AI 正在规划任务...")
    try:
        sub_tasks = await plan_task(user_input)
    except Exception as e:
        print(f"规划失败（可能是 Mock 模式）：{e}")
        # Mock 模式直接用固定子任务测试
        sub_tasks = [{"description": "列出Desktop文件", "tool": "file",
                      "params": {"action": "list", "path": "~/Desktop"},
                      "confidence": 0.95, "risk_level": "low",
                      "requires_human": False, "reason_if_uncertain": ""}]

    for i, st in enumerate(sub_tasks):
        print(f"\n步骤 {i+1}：{st['description']}")
        print(f"  工具：{st['tool']} | 置信度：{st['confidence']} | 风险：{st['risk_level']}")

        if st.get("requires_human") or st["confidence"] < 0.75:
            ans = input(f"  ⚠️  需要确认（{st.get('reason_if_uncertain', 'AI不确定')}）[y/n]：")
            if ans.lower() != "y":
                print("  跳过")
                continue

        if st["tool"] == "file":
            result = await file_execute(st["params"])
            if result["success"]:
                print(f"  ✅ 完成：{str(result['output'])[:200]}")
            else:
                print(f"  ❌ 失败：{result['error']}")
        else:
            print(f"  ⏭️  {st['tool']} 工具暂未实现，跳过")

    print("\n✨ 任务完成")

if __name__ == "__main__":
    asyncio.run(main())
```

**验收：**

```bash
cd agent-core
source .venv/bin/activate
python3 run_task.py
# 输入：列出我桌面上的文件
# 应该看到桌面文件列表
```

---

## 阶段 11 — WebSocket 接入

完成上面的 HTTP 版本验证后，再接 WebSocket 长连接。

**`server/ws/connection_manager.py`：**（见主文档第二十三章）

**`server/ws/ws_agent.py`：**（见主文档第二十三章）

**启动验证：**

```bash
# 安装 wscat 测试工具
npm install -g wscat

# 先登录拿 token
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 测试 WebSocket 连接
wscat -c "ws://localhost:8000/ws/agent/connect?token=$TOKEN"
# 输入：{"type":"heartbeat","task_id":"test","timestamp":"2026-01-01","payload":{}}
# 应该收到响应
```

---

## 阶段 12 — 简单 Web 前端验证

在做 Tauri 桌面端之前，先用纯 HTML 验证完整交互流程。

```bash
mkdir -p platform/public
cat > platform/public/index.html << 'EOF'
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>FurtherAether Dev</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; }
    input, button { padding: 8px; margin: 4px; }
    button { cursor: pointer; background: #4f46e5; color: white; border: none; border-radius: 4px; }
    #log { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px;
           font-family: monospace; font-size: 13px; height: 300px; overflow-y: auto; }
  </style>
</head>
<body>
  <h2>FurtherAether Dev Console</h2>

  <div>
    <input id="email" placeholder="邮箱" value="test@test.com">
    <input id="password" type="password" placeholder="密码" value="123456">
    <button onclick="login()">登录</button>
  </div>

  <div style="margin-top:16px">
    <input id="task" placeholder="输入任务..." style="width:400px">
    <button onclick="submitTask()">提交任务</button>
  </div>

  <div id="log" style="margin-top:16px">等待操作...</div>

  <script>
    let token = '';

    function log(msg) {
      const el = document.getElementById('log');
      el.innerHTML += '\n' + new Date().toLocaleTimeString() + ' ' + msg;
      el.scrollTop = el.scrollHeight;
    }

    async function login() {
      const r = await fetch('http://localhost:8000/auth/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          email: document.getElementById('email').value,
          password: document.getElementById('password').value
        })
      });
      const data = await r.json();
      if (data.access_token) {
        token = data.access_token;
        log('✅ 登录成功，plan=' + data.plan);
      } else {
        log('❌ 登录失败：' + JSON.stringify(data));
      }
    }

    async function submitTask() {
      if (!token) { log('请先登录'); return; }
      const task = document.getElementById('task').value;
      log('📋 提交任务：' + task);

      const r = await fetch('http://localhost:8000/v1/inference', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
        body: JSON.stringify({
          provider: 'mock',
          model: 'deepseek-chat',
          messages: [{role: 'user', content: task}]
        })
      });
      const data = await r.json();
      log('🤖 AI 返回：' + JSON.stringify(data.choices[0].message.content).substring(0, 200));
    }
  </script>
</body>
</html>
EOF

# 启动静态文件服务器
cd platform/public
python3 -m http.server 3000
```

浏览器打开 `http://localhost:3000`，登录并提交任务，验证完整流程 ✅

---

## 完成后的下一步

localhost 版本跑通后，再回到主文档处理：

1. **WebSocket 完整实现**（主文档第二十三章）
2. **Tauri 桌面端**（主文档第十九章）
3. **Cloudflare Tunnel 配置**（配好后替换所有 localhost 为真实域名）
4. **生产部署**（主文档第十七章 §17.9）

---

*Localhost 版本 v0.1 | 仅用于本地开发验证*
