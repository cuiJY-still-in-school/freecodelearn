from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from dotenv import load_dotenv

# Import new modules
from .llm_client import LLMClient
from .planner import TaskPlanner
from .experience_manager import ExperienceManager

# Load environment variables
load_dotenv()

app = FastAPI(
    title="SkyFly AI Service",
    description="AI service for SkyFly automation tool",
    version="0.1.0",
)

# Initialize AI components
try:
    llm_client = LLMClient(
        api_key=os.getenv("OPENAI_API_KEY"), model=os.getenv("DEFAULT_MODEL", "gpt-4")
    )
    planner = TaskPlanner(llm_client)
    experience_manager = ExperienceManager(
        storage_path=os.getenv("EXPERIENCE_PATH", "data/experiences.json")
    )
    print("✅ AI Service components initialized")
except Exception as e:
    print(f"⚠️ Warning: Failed to initialize AI components: {e}")
    llm_client = None
    planner = None
    experience_manager = None


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


class ExperienceEntry(BaseModel):
    task_description: str
    solution: List[ToolCall]
    success: bool
    metadata: Optional[Dict[str, Any]] = None


# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "skyfly-ai",
        "version": "0.1.0",
        "ai_components": {
            "llm": llm_client is not None,
            "planner": planner is not None,
            "experience_manager": experience_manager is not None,
        },
    }


# Main task processing endpoint
@app.post("/process", response_model=TaskResponse)
async def process_task(request: TaskRequest):
    """
    Process a natural language task and return tool calls
    """
    try:
        if not planner or not experience_manager:
            raise HTTPException(
                status_code=503, detail="AI service not fully initialized"
            )

        # Get context
        context = request.context or {}

        # Search for similar experiences
        similar_experiences = experience_manager.search(
            request.user_input, limit=3, min_success_rate=0.5
        )

        # Create plan using LLM
        plan = await planner.create_plan(
            request.user_input, context=context, similar_experiences=similar_experiences
        )

        # Convert to ToolCall model
        tool_calls = [
            ToolCall(tool_name=step["tool"], parameters=step.get("parameters", {}))
            for step in plan.get("steps", [])
        ]

        response = TaskResponse(
            success=True,
            reasoning=plan["explanation"],
            tool_calls=tool_calls,
            requires_confirmation=plan.get("needs_confirmation", True),
            context=context,
        )

        return response

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Experience management endpoints
@app.post("/experience")
async def add_experience(entry: ExperienceEntry):
    """
    Add a new experience entry to the knowledge base
    """
    try:
        if not experience_manager:
            raise HTTPException(
                status_code=503, detail="Experience manager not initialized"
            )

        # Convert ToolCall models to dicts
        solution_list = [
            {"tool": tc.tool_name, "parameters": tc.parameters} for tc in entry.solution
        ]

        experience_manager.add_experience(
            task_description=entry.task_description,
            solution=solution_list,
            success=entry.success,
            metadata=entry.metadata,
        )

        return {
            "status": "success",
            "message": "Experience added",
            "experience_id": "NEW",  # Would be actual ID in production
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/experience/search")
async def search_experiences(query: str, limit: int = 5, min_success_rate: float = 0.5):
    """
    Search for similar experiences
    """
    try:
        if not experience_manager:
            raise HTTPException(
                status_code=503, detail="Experience manager not initialized"
            )

        results = experience_manager.search(
            query, limit=limit, min_success_rate=min_success_rate
        )

        return {
            "query": query,
            "results": results,
            "count": len(results),
            "min_success_rate": min_success_rate,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/experience/stats")
async def get_experience_stats():
    """
    Get statistics about stored experiences
    """
    try:
        if not experience_manager:
            raise HTTPException(
                status_code=503, detail="Experience manager not initialized"
            )

        return experience_manager.get_statistics()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Tool planning endpoint
@app.post("/plan")
async def create_plan(task: str, available_tools: List[str] = None):
    """
    Create a plan of tool calls for a given task
    """
    try:
        if not planner:
            raise HTTPException(status_code=503, detail="Planner not initialized")

        # Use available tools if provided
        tools = available_tools or planner.available_tools

        # Get context
        context = {"available_tools": tools}

        # Create plan
        plan = await planner.create_plan(task, context=context)

        return {
            "task": task,
            "plan": plan,
            "estimated_steps": len(plan.get("steps", [])),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Batch task processing
@app.post("/batch")
async def batch_process(tasks: List[TaskRequest]):
    """
    Process multiple tasks
    """
    try:
        if not planner or not experience_manager:
            raise HTTPException(
                status_code=503, detail="AI service not fully initialized"
            )

        results = []
        for task in tasks:
            try:
                result = await process_task(task)
                results.append(result)
            except Exception as e:
                results.append(
                    TaskResponse(
                        success=False,
                        reasoning="Task failed",
                        tool_calls=[],
                        requires_confirmation=False,
                        error=str(e),
                    )
                )

        return {
            "total": len(tasks),
            "successful": sum(1 for r in results if r.success),
            "failed": sum(1 for r in results if not r.success),
            "results": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("RELOAD", "false").lower() == "true",
    )
