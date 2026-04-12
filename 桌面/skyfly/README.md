SkyFly - AI-Powered Automation Tool

SkyFly is an AI-powered automation tool that enables users to accomplish any computer task through natural language instructions. Inspired by openclaw, it combines the core toolset of opencode with advanced AI-driven autonomous exploration and experience transfer logic.

## Project Status

**Phase 1: Rust Core Engine (In Progress)**
- ✅ Tool framework and trait definitions
- ✅ Bash tool implementation
- ✅ Read/Write tools implementation
- ✅ Edit tool implementation
- ✅ Glob tool implementation
- 🚧 Python AI service integration
- 🚧 Frontend interface development

## Features

- **Natural Language Interface**: Understand and execute complex user requests
- **Core Toolset**: bash, webfetch, read, write, edit, glob operations
- **Autonomous Exploration**: AI learns from its own exploration experiences
- **Experience Transfer**: Hierarchical experience reuse system
- **Dual Deployment**: Local mode (macOS/Linux) + Sandbox mode (Ubuntu container)

## Core Technology

- **Core Engine**: Rust (Tokio, clap, serde)
- **AI Service**: Python (FastAPI, LangChain, LLM integration)
- **Frontend**: Tauri + React (desktop), React (web)
- **Database**: SQLite + LanceDB (vector database)
- **Communication**: gRPC/protobuf between Rust and Python

## Implementation Plan

See `plan1.0.md` for detailed implementation roadmap.

## Getting Started

### Prerequisites

- Rust 1.70+ 
- Python 3.10+
- Node.js 18+
- Docker/Podman

### Building the Core Engine

```bash
cd rust-core
cargo build
```

### Running the CLI

```bash
cargo run -- list
cargo run -- execute --tool bash --parameter command="ls -la"
cargo run -- info bash
```

## Project Structure

```
skyfly/
├── rust-core/           # Rust core engine
│   ├── src/
│   │   ├── main.rs      # CLI entry point
│   │   └── tools/       # Tool implementations
│   │       ├── types.rs # Shared types and traits
│   │       ├── bash.rs  # Bash execution
│   │       ├── read.rs  # File reading
│   │       ├── write.rs # File writing
│   │       ├── edit.rs  # File editing
│   │       └── glob.rs  # File searching
│   └── Cargo.toml
├── python-ai/          # Python AI service
├── frontend/          # React/Tauri frontend
├── plan1.0.md         # Implementation plan
└── README.md
```

## License

MIT License - See LICENSE file for details

## Contributing

This is an open-source project for personal use. Contributions welcome.

---

**Status**: Development Phase 1 - Rust Core Engine

**Last Updated**: 2026-04-12