import os
import json
import re
from typing import Dict, List, Optional
import httpx


class MultiModelClient:
    """统一的多模型AI客户端，支持OpenAI、DeepSeek、Kimi、自定义API等"""

    # 预设的模型配置
    MODEL_PRESETS = {
        "openai": {
            "base_url": "https://api.openai.com/v1",
            "api_key_env": "OPENAI_API_KEY",
            "default_model": "gpt-4",
            "name": "OpenAI GPT-4",
        },
        "deepseek": {
            "base_url": "https://api.deepseek.com/v1",
            "api_key_env": "DEEPSEEK_API_KEY",
            "default_model": "deepseek-chat",
            "name": "DeepSeek V3",
        },
        "kimi": {
            "base_url": "https://api.moonshot.cn/v1",
            "api_key_env": "KIMI_API_KEY",
            "default_model": "moonshot-v1-8k",
            "name": "Kimi",
        },
        "custom": {
            "base_url": "",
            "api_key_env": "CUSTOM_API_KEY",
            "default_model": "custom-model",
            "name": "Custom API",
        },
    }

    def __init__(
        self,
        provider: str = "openai",
        api_key: str = None,
        model: str = None,
        base_url: str = None,
    ):
        self.provider = provider.lower()

        preset = self.MODEL_PRESETS.get(self.provider, self.MODEL_PRESETS["openai"])

        self.api_key = api_key or os.getenv(preset["api_key_env"])
        self.model = model or os.getenv("DEFAULT_MODEL") or preset["default_model"]
        self.base_url = base_url or os.getenv("LLM_BASE_URL") or preset["base_url"]

        if self.provider == "custom":
            self.base_url = base_url or os.getenv("CUSTOM_BASE_URL", "")

        self.name = preset["name"]

    def is_available(self) -> bool:
        """检查当前模型是否可用（API key是否配置）"""
        return bool(self.api_key) and bool(self.base_url)

    async def generate(
        self,
        prompt: str,
        system_prompt: str = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> str:
        """生成LLM回复"""
        if not self.is_available():
            raise Exception(f"{self.name} 未配置：缺少 API key 或 base URL")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        system_content = (
            system_prompt
            or "You are a helpful AI assistant that helps users accomplish tasks by planning and executing tool calls."
        )

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_content},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        # DeepSeek/Kimi 等兼容 OpenAI 格式的 API
        endpoint = f"{self.base_url.rstrip('/')}/chat/completions"

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(endpoint, headers=headers, json=payload)
                response.raise_for_status()

                data = response.json()
                return data["choices"][0]["message"]["content"]

        except httpx.HTTPStatusError as e:
            error_detail = ""
            try:
                error_detail = e.response.text
            except:
                pass
            raise Exception(f"{self.name} API 错误: {str(e)} {error_detail}")
        except Exception as e:
            raise Exception(f"{self.name} 请求失败: {str(e)}")

    async def extract_tool_calls(
        self, user_request: str, available_tools: List[str]
    ) -> Dict:
        """从用户请求中提取工具调用"""

        system_prompt = """你是一个智能任务规划助手。你的工作是分析用户的自然语言请求，并生成需要执行的工具调用计划。

可用工具：bash（执行命令）、read（读取文件）、write（写入文件）、edit（编辑文件）、glob（搜索文件）、webfetch（获取网页内容）。

你必须严格按以下JSON格式输出，不要添加任何额外说明：
{
    "explanation": "简要说明分析结果",
    "tool_calls": [
        {
            "tool": "工具名称",
            "parameters": {"参数名": "参数值"},
            "reasoning": "为什么需要这个工具"
        }
    ]
}

如果不需要工具，返回：
{
    "explanation": "直接回答用户问题",
    "tool_calls": []
}

重要规则：
1. 只输出纯JSON，不要 markdown 代码块
2. 参数值必须是字符串
3. 文件路径如果是相对路径，以当前工作目录为基准
4. bash 命令必须安全，不要执行 rm -rf 等危险命令
"""

        prompt = f"""分析用户请求："{user_request}"

可用工具列表：{", ".join(available_tools)}

请输出JSON格式的工具调用计划。"""

        try:
            response = await self.generate(
                prompt, system_prompt=system_prompt, temperature=0.3
            )
            return self._parse_json_response(response)
        except Exception as e:
            return {
                "explanation": f"LLM分析失败，使用备用策略：{str(e)}",
                "tool_calls": self._fallback_extract(user_request, available_tools),
            }

    def _parse_json_response(self, response: str) -> Dict:
        """从LLM响应中解析JSON"""
        # 尝试直接解析
        response = response.strip()

        # 去除 markdown 代码块
        if response.startswith("```json"):
            response = response[7:]
        elif response.startswith("```"):
            response = response[3:]
        if response.endswith("```"):
            response = response[:-3]

        response = response.strip()

        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass

        # 尝试正则提取 JSON 对象
        json_match = re.search(r"\{[\s\S]*\}", response)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass

        raise Exception("无法从响应中解析JSON")

    def _fallback_extract(
        self, user_request: str, available_tools: List[str]
    ) -> List[Dict]:
        """备用的规则基础提取"""
        user_input = user_request.lower()
        tool_calls = []

        # 文件操作
        if "read" in user_input or "读取" in user_input or "查看" in user_input:
            import re as regex

            file_match = regex.search(r'["\']([^"\']+)["\']', user_request)
            if file_match:
                filename = file_match.group(1)
            else:
                # 尝试提取常见文件名
                words = user_request.split()
                filename = None
                for w in words:
                    if "." in w and not w.startswith("http"):
                        filename = w.strip(".,;:!?")
                        break
                filename = filename or "README.md"
            tool_calls.append(
                {
                    "tool": "read",
                    "parameters": {"path": filename},
                    "reasoning": "检测到文件读取请求",
                }
            )

        elif "list" in user_input or "列出" in user_input or "搜索文件" in user_input:
            pattern = (
                "*.md"
                if "*.md" in user_request
                else "*.txt"
                if "*.txt" in user_request
                else "*"
            )
            tool_calls.append(
                {
                    "tool": "glob",
                    "parameters": {"pattern": pattern},
                    "reasoning": "检测到文件列表请求",
                }
            )

        elif "write" in user_input or "创建" in user_input or "写入" in user_input:
            import re as regex

            file_match = regex.search(r'["\']([^"\']+)["\']', user_request)
            filename = file_match.group(1) if file_match else "/tmp/test.txt"
            tool_calls.append(
                {
                    "tool": "write",
                    "parameters": {"path": filename, "content": "Hello from SkyFly"},
                    "reasoning": "检测到文件写入请求",
                }
            )

        elif (
            "bash" in user_input
            or "command" in user_input
            or "echo" in user_input
            or "运行" in user_input
            or "执行" in user_input
        ):
            import re as regex

            if "echo" in user_input:
                echo_match = regex.search(r'echo\s+[\'"]([^\'"]+)[\'"]', user_request)
                command = (
                    f"echo '{echo_match.group(1)}'"
                    if echo_match
                    else "echo 'Hello from SkyFly'"
                )
            else:
                command = "echo 'Hello from SkyFly'"
            tool_calls.append(
                {
                    "tool": "bash",
                    "parameters": {"command": command},
                    "reasoning": "检测到命令执行请求",
                }
            )

        elif (
            "web" in user_input
            or "fetch" in user_input
            or "网页" in user_request
            or "下载" in user_request
        ):
            import re as regex

            url_match = regex.search(r"https?://[^\s]+", user_request)
            url = url_match.group(0) if url_match else "https://example.com"
            tool_calls.append(
                {
                    "tool": "webfetch",
                    "parameters": {"url": url},
                    "reasoning": "检测到网页获取请求",
                }
            )

        return tool_calls

    @classmethod
    def list_available_providers(cls) -> List[Dict]:
        """列出所有可用的模型提供商"""
        result = []
        for key, preset in cls.MODEL_PRESETS.items():
            api_key = os.getenv(preset["api_key_env"])
            result.append(
                {
                    "id": key,
                    "name": preset["name"],
                    "configured": bool(api_key),
                    "default_model": preset["default_model"],
                }
            )
        return result
