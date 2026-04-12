from .llm_client import LLMClient
from .planner import TaskPlanner
from .experience_manager import ExperienceManager


class AIService:
    """Main AI service orchestrator"""

    def __init__(
        self,
        llm_client: LLMClient,
        planner: TaskPlanner,
        experience_manager: ExperienceManager,
    ):
        self.llm_client = llm_client
        self.planner = planner
        self.experience_manager = experience_manager

    async def process_task(self, user_input: str, context: dict = None) -> dict:
        """
        Process a natural language task

        Args:
            user_input: User's natural language request
            context: Additional context about the task

        Returns:
            Processing result with reasoning and tool calls
        """
        context = context or {}

        # 1. Search for similar experiences
        similar_experiences = await self.experience_manager.search(user_input, limit=3)

        # 2. Use LLM to understand the request and plan tool calls
        plan = await self.planner.create_plan(user_input, similar_experiences)

        # 3. Execute the plan
        tool_calls = []
        for step in plan["steps"]:
            tool_calls.append(
                {
                    "tool_name": step["tool"],
                    "parameters": step["params"],
                    "reasoning": step["reasoning"],
                }
            )

        return {
            "success": True,
            "reasoning": plan["explanation"],
            "tool_calls": tool_calls,
            "similar_experiences": similar_experiences,
            "context": context,
        }
