# SkyFly Python AI Service

AI service component for SkyFly automation tool. Provides natural language understanding, task planning, and LLM integration.

## Features

- **Natural Language Processing**: Understand user requests and convert to tool calls
- **Task Planning**: Break complex tasks into sequences of tool executions
- **Experience Management**: Store and retrieve successful task solutions
- **LLM Integration**: Support for OpenAI GPT and other language models

## Architecture

```
python-ai/
├── app/
│   ├── main.py          # FastAPI application entry
│   ├── llm/             # LLM integration modules
│   ├── planning/        # Task planning logic
│   └── experience/      # Experience storage and retrieval
├── requirements.txt     # Python dependencies
├── Dockerfile          # Container configuration
└── start.sh            # Development startup script
```

## Quick Start

### Development Mode

```bash
cd python-ai
./start.sh
```

The service will be available at `http://localhost:8000`

### Using Docker

```bash
cd python-ai
docker build -t skyfly-ai .
docker run -p 8000:8000 skyfly-ai
```

## API Endpoints

### Health Check
```bash
curl http://localhost:8000/health
```

### Process Task
```bash
curl -X POST http://localhost:8000/process \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "List all files in current directory",
    "context": {},
    "session_id": "test-session"
  }'
```

### Add Experience
```bash
curl -X POST http://localhost:8000/experience \
  -H "Content-Type: application/json" \
  -d '{
    "task_description": "Read a file",
    "solution": [{"tool_name": "read", "parameters": {"path": "test.txt"}}],
    "success": true
  }'
```

### Search Experiences
```bash
curl "http://localhost:8000/experience/search?query=read%20file&limit=5"
```

## Configuration

Create a `.env` file:

```env
OPENAI_API_KEY=your-api-key
DEFAULT_MODEL=gpt-4
MAX_TOKENS=2000
```

## Development

### Run Tests

```bash
pytest tests/
```

### Code Style

```bash
black app/
flake8 app/
```

## Roadmap

- [ ] LLM integration (OpenAI GPT)
- [ ] Task planning algorithm
- [ ] Experience vector database
- [ ] Natural language understanding
- [ ] Context management
- [ ] Multi-step task execution

## License

MIT