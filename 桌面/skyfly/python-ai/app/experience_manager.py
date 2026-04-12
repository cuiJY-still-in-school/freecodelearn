from typing import List, Dict, Any, Optional
from datetime import datetime
import json


class ExperienceManager:
    """Manage tool execution experiences"""

    def __init__(self, storage_path: str = "data/experiences.json"):
        self.storage_path = storage_path
        self.experiences: List[Dict] = []
        self.load_experiences()

    def load_experiences(self):
        """Load experiences from storage"""
        try:
            with open(self.storage_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.experiences = data.get("experiences", [])
        except FileNotFoundError:
            self.experiences = []
        except json.JSONDecodeError:
            self.experiences = []

    def save_experiences(self):
        """Save experiences to storage"""
        import os

        os.makedirs(os.path.dirname(self.storage_path) or ".", exist_ok=True)

        with open(self.storage_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "version": "1.0",
                    "updated_at": datetime.now().isoformat(),
                    "experiences": self.experiences,
                },
                f,
                indent=2,
                ensure_ascii=False,
            )

    def add_experience(
        self,
        task_description: str,
        solution: List[Dict],
        success: bool,
        metadata: Optional[Dict] = None,
    ):
        """
        Add a new experience entry

        Args:
            task_description: Description of the task
            solution: List of tool calls used
            success: Whether the task was successful
            metadata: Additional metadata
        """
        experience = {
            "id": self._generate_id(),
            "task_description": task_description,
            "solution": solution,
            "success": success,
            "metadata": metadata or {},
            "created_at": datetime.now().isoformat(),
        }

        self.experiences.append(experience)
        self.save_experiences()

    def search(
        self, query: str, limit: int = 5, min_success_rate: float = 0.5
    ) -> List[Dict]:
        """
        Search for similar experiences

        Args:
            query: Search query
            limit: Maximum number of results
            min_success_rate: Minimum success rate filter

        Returns:
            List of similar experiences
        """
        if not query:
            return self.experiences[:limit]

        # Simple keyword matching for now
        # In production, use vector embeddings
        query_lower = query.lower()

        similar = []
        for exp in self.experiences:
            # Check task description
            if query_lower in exp["task_description"].lower():
                similar.append(exp)

        # Filter by success rate
        if min_success_rate < 1.0:
            total = len(similar)
            if total > 0:
                successful = sum(1 for exp in similar if exp["success"])
                similar = [exp for exp in similar if exp["success"]]

        # Limit results
        return similar[:limit]

    def get_statistics(self) -> Dict:
        """Get statistics about stored experiences"""
        total = len(self.experiences)
        successful = sum(1 for exp in self.experiences if exp["success"])
        failed = total - successful

        return {
            "total_experiences": total,
            "successful": successful,
            "failed": failed,
            "success_rate": successful / total if total > 0 else 0,
            "most_common_tools": self._get_most_common_tools(),
            "avg_steps": self._get_average_steps(),
        }

    def _generate_id(self) -> str:
        """Generate a unique ID for an experience"""
        import uuid

        return str(uuid.uuid4())

    def _get_most_common_tools(self) -> Dict[str, int]:
        """Get most frequently used tools"""
        tool_counts: Dict[str, int] = {}

        for exp in self.experiences:
            for step in exp.get("solution", []):
                tool = step.get("tool", "unknown")
                tool_counts[tool] = tool_counts.get(tool, 0) + 1

        return dict(sorted(tool_counts.items(), key=lambda x: x[1], reverse=True)[:5])

    def _get_average_steps(self) -> float:
        """Get average number of steps per experience"""
        if not self.experiences:
            return 0.0

        total_steps = sum(len(exp.get("solution", [])) for exp in self.experiences)
        return total_steps / len(self.experiences)
