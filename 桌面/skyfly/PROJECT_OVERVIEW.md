# SkyFly Project

AI-Powered Automation Tool for Complex Task Execution

## Project Overview

SkyFly enables users to accomplish any computer task through natural language instructions. It combines a powerful Rust-based toolset with advanced AI capabilities for autonomous exploration and experience transfer.

## Current Status

### ✅ Completed
- **Project Planning**: Full implementation plan defined in `plan1.0.md`
- **Rust Core Engine**: Tool framework and implementations
  - Bash tool for shell command execution
  - Read/Write tools for file operations
  - Edit tool for content manipulation
  - Glob tool for file searching
  - Tool registry and CLI interface
- **Documentation**: README, code comments, implementation plan
- **Project Structure**: Proper organization for all components

### 🚧 In Progress
- Rust core engine compilation and testing
- Python AI service implementation
- Frontend interface development
- Integration and testing

## Quick Start

### Build Rust Core
```bash
cd rust-core
cargo build
```

### Run CLI
```bash
cargo run -- list
cargo run -- info bash
cargo run -- execute --tool bash --parameter command="echo Hello"
```

## Key Components

1. **Rust Core Engine** (`rust-core/`)
   - Tool execution framework
   - Bash, Read, Write, Edit, Glob implementations
   - CLI interface

2. **Python AI Service** (`python-ai/`)
   - LLM integration
   - Natural language understanding
   - Experience management

3. **Frontend** (`frontend/`)
   - Tauri + React desktop app
   - Chat interface
   - Tool visualization

## Documentation

- **Implementation Plan**: See `plan1.0.md` for detailed 30-week roadmap
- **Technical Specs**: See `project.md` for requirements and architecture
- **Session Notes**: See `memory/2025-04-12.md` for daily development logs

## Technology Stack

**Core Engine**: Rust + Tokio + Serde + Clap  
**AI Service**: Python + FastAPI + LangChain + OpenAI  
**Frontend**: Tauri + React  
**Database**: SQLite + LanceDB  
**Communication**: gRPC/protobuf

## Next Steps

1. Fix Rust compilation issues
2. Implement Python AI service
3. Create Tauri frontend
4. Integrate Rust-Python components
5. Implement experience transfer system

## Contact

- GitHub: skyfly-ai/skyfly
- Status: Active Development

---

**Version**: 0.1.0-alpha  
**Last Updated**: 2026-04-12