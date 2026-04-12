import os
from typing import Dict, List, Optional
import httpx


class LLMClient:
    """LLM client for OpenAI API and other language models"""

    def __init__(self, api_key: str = None, model: str = None, base_url: str = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model or os.getenv("DEFAULT_MODEL", "gpt-4")
        self.base_url = base_url or os.getenv(
            "LLM_BASE_URL", "https://api.openai.com/v1"
        )

    async def generate(
        self, prompt: str, temperature: float = 0.7, max_tokens: int = 2000
    ) -> str:
        """
        Generate response from LLM

        Args:
            prompt: Input prompt
            temperature: Temperature for generation (0-1)
            max_tokens: Maximum tokens to generate

        Returns:
            LLM response text
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a helpful AI assistant that helps users accomplish tasks by planning and executing tool calls.",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions", headers=headers, json=payload
                )
                response.raise_for_status()

                data = response.json()
                return data["choices"][0]["message"]["content"]

        except httpx.HTTPError as e:
            raise Exception(f"LLM API error: {str(e)}")

    async def extract_tool_calls(
        self, user_request: str, available_tools: List[str]
    ) -> Dict:
        """
        Extract tool calls from user request

        Args:
            user_request: User's natural language request
            available_tools: List of available tool names

        Returns:
            Tool calls with reasoning
        """
        prompt = f"""
        Analyze the following user request and determine which tool calls are needed.
        
        Available tools: {", ".join(available_tools)}
        
        User request: "{user_request}"
        
        Output format (JSON):
        {{
            "explanation": "Brief explanation of what needs to be done",
            "tool_calls": [
                {{
                    "tool": "tool_name",
                    "parameters": {{"param1": "value", "param2": "value"}},
                    "reasoning": "Why this tool call is needed"
                }}
            ]
        }}
        
        If the request requires no tools, return:
        {{
            "explanation": "User request is completed",
            "tool_calls": []
        }}
        
        Return only the JSON object, nothing else.
        """

        response = await self.generate(prompt)

        # Extract JSON from response
        import json
        import re

        # Find JSON block
        json_match = re.search(r"\{.*\}", response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass

        # Fallback
        return {"explanation": "Unable to extract structured plan", "tool_calls": []}
