import os
import re
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

ENV_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")

# 支持的配置项
SUPPORTED_KEYS = {
    "OPENAI_API_KEY": {"name": "OpenAI API Key", "provider": "openai"},
    "ANTHROPIC_API_KEY": {"name": "Anthropic API Key", "provider": "claude"},
    "GOOGLE_API_KEY": {"name": "Google API Key", "provider": "gemini"},
    "TOGETHER_API_KEY": {"name": "Together AI API Key", "provider": "llama"},
    "MISTRAL_API_KEY": {"name": "Mistral API Key", "provider": "mistral"},
    "DEEPSEEK_API_KEY": {"name": "DeepSeek API Key", "provider": "deepseek"},
    "KIMI_API_KEY": {"name": "Kimi API Key", "provider": "kimi"},
    "QWEN_API_KEY": {"name": "Qwen API Key", "provider": "qwen"},
    "ERNIE_API_KEY": {"name": "ERNIE API Key", "provider": "ernie"},
    "ERNIE_SECRET_KEY": {"name": "ERNIE Secret Key", "provider": "ernie"},
    "ZHIPU_API_KEY": {"name": "Zhipu API Key", "provider": "zhipu"},
    "CUSTOM_API_KEY": {"name": "Custom API Key", "provider": "custom"},
    "CUSTOM_BASE_URL": {"name": "Custom Base URL", "provider": "custom"},
}


class ConfigItem(BaseModel):
    key: str
    value: str


class ConfigUpdate(BaseModel):
    configs: List[ConfigItem]


def read_env_file() -> Dict[str, str]:
    """读取 .env 文件"""
    configs = {}
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    configs[key.strip()] = value.strip()
    return configs


def write_env_file(configs: Dict[str, str]):
    """写入 .env 文件"""
    lines = []

    # 保留现有文件的注释和结构
    existing_lines = []
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            existing_lines = f.readlines()

    written_keys = set()

    # 先更新已有行
    for line in existing_lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key, _ = stripped.split("=", 1)
            key = key.strip()
            if key in configs:
                lines.append(f"{key}={configs[key]}\n")
                written_keys.add(key)
            else:
                lines.append(line)
        else:
            lines.append(line)

    # 添加新配置
    for key, value in configs.items():
        if key not in written_keys:
            lines.append(f"{key}={value}\n")

    with open(ENV_FILE, "w", encoding="utf-8") as f:
        f.writelines(lines)


def mask_value(value: str) -> str:
    """对敏感值进行脱敏显示"""
    if len(value) <= 8:
        return "****"
    return value[:4] + "****" + value[-4:]


@router.get("")
async def get_configs():
    """获取当前配置（敏感值脱敏）"""
    try:
        configs = read_env_file()
        result = []

        for key, meta in SUPPORTED_KEYS.items():
            value = configs.get(key, "")
            is_secret = "KEY" in key or "SECRET" in key

            result.append(
                {
                    "key": key,
                    "name": meta["name"],
                    "provider": meta["provider"],
                    "value": mask_value(value) if is_secret and value else value,
                    "configured": bool(value),
                    "is_secret": is_secret,
                }
            )

        return {"configs": result, "env_file": ENV_FILE}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def update_configs(update: ConfigUpdate):
    """更新配置"""
    try:
        current_configs = read_env_file()

        for item in update.configs:
            if item.key not in SUPPORTED_KEYS:
                raise HTTPException(
                    status_code=400, detail=f"不支持的配置项: {item.key}"
                )

            # 如果值是 **** 开头的脱敏值，保留原值
            if item.value.startswith("****") or item.value == mask_value(
                current_configs.get(item.key, "")
            ):
                continue

            current_configs[item.key] = item.value
            # 同时更新当前进程的环境变量
            os.environ[item.key] = item.value

        write_env_file(current_configs)

        return {"status": "success", "message": "配置已保存并生效"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{key}")
async def delete_config(key: str):
    """删除某个配置"""
    try:
        if key not in SUPPORTED_KEYS:
            raise HTTPException(status_code=400, detail=f"不支持的配置项: {key}")

        current_configs = read_env_file()
        if key in current_configs:
            del current_configs[key]
            if key in os.environ:
                del os.environ[key]

        write_env_file(current_configs)

        return {"status": "success", "message": f"配置 {key} 已删除"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reload")
async def reload_configs():
    """重新加载 .env 文件到环境变量"""
    try:
        configs = read_env_file()
        for key, value in configs.items():
            os.environ[key] = value

        return {"status": "success", "message": "配置已重新加载", "count": len(configs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
