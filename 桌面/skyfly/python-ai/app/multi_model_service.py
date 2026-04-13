#!/usr/bin/env python3
"""
SkyFly AI Service - 支持多模型适配的统一入口
支持：simple规则引擎、OpenAI、DeepSeek、Kimi、自定义API
"""

import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import json

# 导入多模型客户端
try:
    from .multi_model_client import MultiModelClient

    MULTI_MODEL_AVAILABLE = True
except ImportError:
    MULTI_MODEL_AVAILABLE = False

# Create app
app = FastAPI(
    title="SkyFly AI Service",
    description="AI service with multi-model support for SkyFly automation tool",
    version="0.2.0",
)


# Request/Response models
class TaskRequest(BaseModel):
    user_input: str
    context: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = None
    model: Optional[str] = "simple"  # simple/openai/deepseek/kimi/custom


class ToolCall(BaseModel):
    tool_name: str
    parameters: Dict[str, Any]


class TaskResponse(BaseModel):
    success: bool
    reasoning: str
    tool_calls: List[ToolCall]
    requires_confirmation: bool = False
    error: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
    model_used: Optional[str] = None


# 可用工具列表
AVAILABLE_TOOLS = ["bash", "read", "write", "edit", "glob", "webfetch"]


# Health check
@app.get("/health")
async def health_check():
    providers = []
    if MULTI_MODEL_AVAILABLE:
        providers = MultiModelClient.list_available_providers()

    return {
        "status": "healthy",
        "service": "skyfly-ai",
        "version": "0.2.0",
        "ai_components": {
            "llm": MULTI_MODEL_AVAILABLE,
            "planner": True,
            "experience_manager": False,
            "multi_model": MULTI_MODEL_AVAILABLE,
        },
        "available_models": [
            {"id": "simple", "name": "Simple Rule Engine", "configured": True}
        ]
        + providers,
        "default_model": "simple",
    }


# 模型列表接口
@app.get("/models")
async def list_models():
    """列出所有可用的AI模型"""
    models = [
        {
            "id": "simple",
            "name": "简单规则引擎（本地）",
            "configured": True,
            "description": "基于规则的快速解析，无需API Key",
        }
    ]

    if MULTI_MODEL_AVAILABLE:
        for provider in MultiModelClient.list_available_providers():
            models.append(
                {
                    "id": provider["id"],
                    "name": provider["name"],
                    "configured": provider["configured"],
                    "description": f"默认模型: {provider['default_model']}",
                }
            )

    return {"models": models}


@app.post("/process", response_model=TaskResponse)
async def process_task(request: TaskRequest):
    """
    处理自然语言任务，根据 model 参数选择不同的AI后端
    """
    model = request.model or "simple"

    try:
        if model == "simple":
            return await _process_with_simple_engine(request)
        elif MULTI_MODEL_AVAILABLE and model in [
            "openai",
            "deepseek",
            "kimi",
            "custom",
        ]:
            return await _process_with_llm(request, model)
        else:
            # 如果请求的模型不可用，回退到 simple
            return await _process_with_simple_engine(request)

    except Exception as e:
        # 如果LLM处理失败，尝试用 simple 引擎作为 fallback
        if model != "simple":
            try:
                fallback_response = await _process_with_simple_engine(request)
                fallback_response.model_used = f"simple (fallback from {model})"
                return fallback_response
            except:
                pass

        raise HTTPException(status_code=500, detail=str(e))


async def _process_with_llm(request: TaskRequest, provider: str) -> TaskResponse:
    """使用LLM处理请求"""
    client = MultiModelClient(provider=provider)

    if not client.is_available():
        # 如果模型未配置，回退到 simple
        fallback = await _process_with_simple_engine(request)
        fallback.model_used = f"simple (fallback: {provider} not configured)"
        return fallback

    result = await client.extract_tool_calls(request.user_input, AVAILABLE_TOOLS)

    tool_calls = []
    for tc in result.get("tool_calls", []):
        tool_calls.append(
            ToolCall(
                tool_name=tc.get("tool", tc.get("tool_name", "bash")),
                parameters=tc.get("parameters", {}),
            )
        )

    return TaskResponse(
        success=True,
        reasoning=result.get("explanation", "LLM分析完成"),
        tool_calls=tool_calls,
        requires_confirmation=False,
        context={"session_id": request.session_id, "provider": provider},
        model_used=provider,
    )


async def _process_with_simple_engine(request: TaskRequest) -> TaskResponse:
    """使用简单的规则引擎处理请求"""
    user_input = request.user_input.lower()
    tool_calls = []
    reasoning = "使用本地规则引擎解析"

    # 检测文件操作
    if (
        "read" in user_input
        or "读取" in request.user_input
        or "查看" in request.user_input
    ):
        import re

        file_match = re.search(r'["\']([^"\']+)["\']', request.user_input)
        if file_match:
            filename = file_match.group(1)
        elif ".txt" in request.user_input or ".md" in request.user_input:
            ext = ".txt" if ".txt" in request.user_input else ".md"
            filename = request.user_input.split(ext)[0].strip().split()[-1] + ext
        else:
            filename = "README.md"

        tool_calls.append(ToolCall(tool_name="read", parameters={"path": filename}))
        reasoning = f"检测到文件读取请求: {filename}"

    elif (
        "list" in user_input
        or "列出" in request.user_input
        or ("文件" in request.user_input and "*.md" in request.user_input)
    ):
        pattern = (
            "*.md"
            if "*.md" in request.user_input
            else "*.txt"
            if "*.txt" in request.user_input
            else "*"
        )
        tool_calls.append(ToolCall(tool_name="glob", parameters={"pattern": pattern}))
        reasoning = f"检测到文件列表请求: {pattern}"

    elif (
        "write" in user_input
        or "创建" in request.user_input
        or "写入" in request.user_input
    ):
        import re

        file_match = re.search(r'["\']([^"\']+)["\']', request.user_input)
        if file_match:
            filename = file_match.group(1)
        else:
            words = request.user_input.split()
            filename = None
            for w in words:
                if "." in w and not w.startswith("http"):
                    filename = w.strip(".,;:!?")
                    break
            filename = filename or "/tmp/test.txt"

        content_match = re.search(r'["\']([^"\']+)["\']', request.user_input)
        content = content_match.group(1) if content_match else "Hello from SkyFly"

        tool_calls.append(
            ToolCall(
                tool_name="write", parameters={"path": filename, "content": content}
            )
        )
        reasoning = f"检测到文件写入请求: {filename}"

    elif (
        "edit" in user_input
        or "编辑" in request.user_input
        or "替换" in request.user_input
        or "修改" in request.user_input
    ):
        import re

        file_match = re.search(r'["\']([^"\']+)["\']', request.user_input)
        filename = file_match.group(1) if file_match else "/tmp/test.txt"

        tool_calls.append(
            ToolCall(
                tool_name="edit",
                parameters={"path": filename, "old_string": "old", "new_string": "new"},
            )
        )
        reasoning = f"检测到文件编辑请求: {filename}"

    elif (
        "bash" in user_input
        or "command" in user_input
        or "echo" in user_input
        or "运行" in request.user_input
        or "执行" in request.user_input
    ):
        import re

        if "echo" in user_input:
            command_match = re.search(r'echo\s+[\'"]([^\'"]+)[\'"]', request.user_input)
            if command_match:
                command = f"echo '{command_match.group(1)}'"
            else:
                command = "echo 'Hello from SkyFly!'"
        else:
            # 尝试提取引号中的命令
            cmd_match = re.search(r'["\']([^"\']+)["\']', request.user_input)
            if cmd_match:
                command = cmd_match.group(1)
            else:
                command = "echo 'Hello from SkyFly!'"

        tool_calls.append(ToolCall(tool_name="bash", parameters={"command": command}))
        reasoning = f"检测到命令执行请求: {command}"

    elif (
        "web" in user_input
        or "fetch" in user_input
        or "网页" in request.user_input
        or "url" in user_input
    ):
        import re

        url_match = re.search(r"https?://[^\s]+", request.user_input)
        url = url_match.group(0) if url_match else "https://example.com"

        tool_calls.append(ToolCall(tool_name="webfetch", parameters={"url": url}))
        reasoning = f"检测到网页获取请求: {url}"

    else:
        reasoning = "未检测到特定操作。尝试：列出文件、读取文件、执行命令、获取网页等"

    return TaskResponse(
        success=True,
        reasoning=reasoning,
        tool_calls=tool_calls,
        requires_confirmation=False,
        context={"session_id": request.session_id},
        model_used="simple",
    )


if __name__ == "__main__":
    import uvicorn

    print("🚀 启动 SkyFly AI Service（多模型版）...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
