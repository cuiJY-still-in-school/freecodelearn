#!/usr/bin/env python3
"""
Simple AI Service for Testing
Minimal version without full LLM dependencies
"""

import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import json

# Create app
app = FastAPI(
    title="SkyFly AI Service (Simple)",
    description="Minimal AI service for testing",
    version="0.1.0-simple",
)


# Request/Response models
class TaskRequest(BaseModel):
    user_input: str
    context: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = None


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


# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "skyfly-ai-simple",
        "version": "0.1.0-simple",
        "ai_components": {
            "llm": False,  # Simple version doesn't have LLM
            "planner": True,
            "experience_manager": True,
        },
        "note": "Simple testing version without LLM integration",
    }


# Main task processing endpoint
@app.post("/process", response_model=TaskResponse)
async def process_task(request: TaskRequest):
    """
    Process a natural language task and return tool calls
    Simple rule-based implementation for testing
    """
    try:
        # Simple rule-based parsing for testing
        user_input = request.user_input.lower()

        tool_calls = []
        reasoning = "Using simple rule-based parsing for testing"

        # Detect file operations
        if "read" in user_input and "file" in user_input:
            # Try to extract filename
            import re

            file_match = re.search(r'["\']([^"\']+)["\']', user_input)
            if file_match:
                filename = file_match.group(1)
            elif ".txt" in user_input or ".md" in user_input:
                # Extract file extension
                ext = ".txt" if ".txt" in user_input else ".md"
                filename = user_input.split(ext)[0].strip() + ext
            else:
                filename = "README.md"

            tool_calls.append(ToolCall(tool_name="read", parameters={"path": filename}))
            reasoning = f"Detected file read request for {filename}"

        elif "list" in user_input and ("file" in user_input or "*.md" in user_input):
            pattern = "*.md" if "*.md" in user_input else "*.txt"
            tool_calls.append(
                ToolCall(tool_name="glob", parameters={"pattern": pattern})
            )
            reasoning = f"Detected file listing request for pattern {pattern}"

        elif "bash" in user_input or "command" in user_input or "echo" in user_input:
            import re

            # Try to extract command
            if "echo" in user_input:
                command_match = re.search(r'echo\s+[\'"]([^\'"]+)[\'"]', user_input)
                if command_match:
                    command = f"echo '{command_match.group(1)}'"
                else:
                    command = "echo 'Hello from SkyFly!'"
            else:
                command = "echo 'Hello from SkyFly!'"

            tool_calls.append(
                ToolCall(tool_name="bash", parameters={"command": command})
            )
            reasoning = f"Detected bash command request: {command}"

        else:
            # Default response
            reasoning = "No specific operation detected. Try commands like 'read file README.md' or 'list *.md files'"

        return TaskResponse(
            success=True,
            reasoning=reasoning,
            tool_calls=tool_calls,
            requires_confirmation=False,
            context={"session_id": request.session_id},
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    print("🚀 Starting SkyFly Simple AI Service...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
