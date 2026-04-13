SkyFly - AI-Powered Automation Tool

SkyFly is an AI-powered automation tool that enables users to accomplish any computer task through natural language instructions. Inspired by openclaw, it combines the core toolset of opencode with advanced AI-driven autonomous exploration and experience transfer logic.

## Project Status

**Phase 1: Rust Core Engine (Completed ✅)**
- ✅ Tool framework and trait definitions
- ✅ Bash tool implementation
- ✅ Read/Write tools implementation
- ✅ Edit tool implementation
- ✅ Glob tool implementation
- ✅ Python AI service integration
- ✅ Frontend interface development (React + Express)

**Phase 2: Frontend Development (In Progress 🚧)**
- ✅ React frontend with Vite
- ✅ Express backend server
- ✅ Full-stack integration
- 🚧 Tauri desktop application

## Features

- **Natural Language Interface**: Understand and execute complex user requests
- **Core Toolset**: bash, webfetch, read, write, edit, glob operations
- **Autonomous Exploration**: AI learns from its own exploration experiences
- **Experience Transfer**: Hierarchical experience reuse system
- **Dual Deployment**: Local mode (macOS/Linux) + Sandbox mode (Ubuntu container)

## Core Technology

- **Core Engine**: Rust (Tokio, clap, serde)
- **AI Service**: Python (FastAPI, LangChain, LLM integration)
- **Frontend**: React + Vite + Express backend
- **Desktop App**: Tauri + React
- **Database**: SQLite + LanceDB (vector database)
- **Communication**: HTTP/REST between components

## Implementation Plan

See `plan1.0.md` for detailed implementation roadmap.

## Getting Started

### Prerequisites

- Rust 1.70+ 
- Python 3.10+
- Node.js 18+
- Docker/Podman

### Development Setup

```bash
# 1. Build Rust Core Engine
cd rust-core
cargo build --release

# 2. Start Python AI Service
cd python-ai
source .venv/bin/activate
python -m app.simple_service &

# 3. Start Backend Server
cd frontend/backend
npm start &

# 4. Start Frontend Dev Server
cd frontend
npm run dev
```

### Running the Application

**Development Mode:**
```bash
# Open browser to http://localhost:5173
# The frontend provides a clean interface for natural language commands
```

**CLI Interface:**
```bash
# Using Rust CLI directly
cd rust-core
cargo run -- ai "list *.md files" --execute

# Check tools
cargo run -- list
cargo run -- info bash

# Check AI service health
cargo run -- ai-health
```

## Project Structure

```
skyfly/
├── rust-core/           # Rust core engine
│   ├── src/
│   │   ├── main.rs      # CLI entry point
│   │   ├── ai_service.rs # AI service HTTP client
│   │   └── tools/       # Tool implementations
│   │       ├── types.rs # Shared types and traits
│   │       ├── simple_impl.rs # Tool implementations
│   │       └── registry.rs
│   └── Cargo.toml
├── python-ai/          # Python AI service
│   └── app/
│       ├── main.py      # Full AI service
│       └── simple_service.py # Simplified testing version
├── frontend/            # React frontend + Express backend
│   ├── src/
│   │   ├── App.jsx     # Main React component
│   │   ├── App.css     # Styling
│   │   └── main.jsx    # Entry point
│   ├── backend/
│   │   └── server.js    # Express server
│   └── package.json
├── plan1.0.md         # Implementation plan
└── README.md
```

## Usage Examples

### Natural Language Commands
```bash
# File operations
"list all markdown files"
"read file README.md"
"write file /tmp/test.txt with content 'Hello World'"

# System operations
"echo Hello from SkyFly"
"check disk space"
```

### CLI Examples
```bash
# AI-powered task processing
skyfly-core ai "list *.md files" --execute
skyfly-core ai "echo Hello World"

# Direct tool execution
skyfly-core execute bash -p command="ls -la"
skyfly-core execute read -p path=README.md
skyfly-core execute glob -p pattern="*.md"
```

## Current Services

- **AI Service**: http://localhost:8000
- **Backend Server**: http://localhost:3000
- **Frontend Dev**: http://localhost:5173

## Architecture

```
User → Frontend (React) → Backend (Express) → 
  ├→ Rust Core (Tools) → System
  └→ AI Service (Python) → Task Analysis → Tool Calls
```

## License

MIT License - See LICENSE file for details

## Contributing

This is an open-source project for personal use. Contributions welcome.

---

**Status**: Development Phase 2 - Frontend Development

**Last Updated**: 2026-04-13