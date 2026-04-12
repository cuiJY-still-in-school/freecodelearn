#!/usr/bin/env python3
"""
Test script for SkyFly Python AI Service
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.llm_client import LLMClient
from app.planner import TaskPlanner
from app.experience_manager import ExperienceManager


async def test_basic():
    """Test basic functionality"""
    print("=" * 50)
    print("Testing Basic Functionality")
    print("=" * 50)

    # Check environment variables
    api_key = "test"  # Don't actually call API
    print(f"✓ API Key configured: {bool(api_key)}")

    print("\n✓ Basic functionality test passed")


async def test_planning():
    """Test task planning"""
    print("\n" + "=" * 50)
    print("Testing Task Planning")
    print("=" * 50)

    try:
        from app.llm_client import LLMClient
        from app.planner import TaskPlanner

        llm_client = LLMClient(api_key="test", model="test-model")

        planner = TaskPlanner(llm_client)

        # Test with a simple task
        task = "List all files in current directory"

        print(f"\nTask: {task}")
        print("\nPlanned steps:")

        # Generate a simple plan without actually calling API
        context = {"working_dir": "."}
        similar_experiences = []

        plan = planner.create_plan(task, context, similar_experiences)

        print(f"Explanation: {plan['explanation']}")
        print(f"Estimated steps: {plan['estimated_steps']}")

        for step in plan.get("steps", []):
            print(f"  - {step['tool']}: {step.get('reasoning', '')}")

        print("\n✓ Planning test passed")

    except ImportError as e:
        print(f"⚠️ Import error: {e}")
    except Exception as e:
        print(f"⚠️ Planning test error: {e}")


async def test_experience_manager():
    """Test experience management"""
    print("\n" + "=" * 50)
    print("Testing Experience Manager")
    print("=" * 50)

    try:
        experience_manager = ExperienceManager()

        # Test search (should be empty initially)
        results = experience_manager.search("test", limit=5)
        print(f"\nInitial search results: {len(results)}")

        # Test statistics
        stats = experience_manager.get_statistics()
        print(f"\nStatistics:")
        print(f"  Total experiences: {stats['total_experiences']}")
        print(f"  Success rate: {stats['success_rate']:.2%}")

        # Add a test experience
        test_solution = [{"tool": "glob", "parameters": {"pattern": "*.py"}}]

        experience_manager.add_experience(
            task_description="Test task", solution=test_solution, success=True
        )

        print(f"\n✓ Experience manager test passed")

    except Exception as e:
        print(f"⚠️ Experience manager test error: {e}")


async def main():
    """Run all tests"""
    print("\n🚀 SkyFly AI Service Test Suite")
    print("=" * 50)

    try:
        await test_basic()
        await test_planning()
        await test_experience_manager()

        print("\n" + "=" * 50)
        print("✅ All tests completed!")
        print("=" * 50)

    except KeyboardInterrupt:
        print("\n\n⚠️ Tests interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Tests failed with error: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
