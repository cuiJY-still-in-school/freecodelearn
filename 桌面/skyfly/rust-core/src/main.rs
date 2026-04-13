mod tools;
mod ai_service;

use crate::tools::{ToolRegistry, ToolArgs, BashTool, ReadTool, WriteTool, EditTool, GlobTool};
use crate::ai_service::AIServiceClient;
use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Execute {
        #[arg(short, long, default_value_t = 0)]
        timeout: u64,
        #[arg(short, long)]
        working_dir: Option<String>,
        #[arg(name = "tool")]
        tool: String,
        #[arg(short = 'p', long, number_of_values = 1)]
        parameter: Vec<String>,
    },
    List,
    Info {
        #[arg(name = "tool")]
        tool: String,
    },
    AI {
        #[arg(name = "task")]
        task: String,
        #[arg(short, long)]
        session_id: Option<String>,
        #[arg(short, long)]
        execute: bool,
    },
    AIHealth,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("skyfly_core=debug".parse()?),
        )
        .init();

    let cli = Cli::parse();

    // Create registry and register tools
    let registry = ToolRegistry::new();
    registry.register(BashTool::new()).await;
    registry.register(ReadTool::new()).await;
    registry.register(WriteTool::new()).await;
    registry.register(EditTool::new()).await;
    registry.register(GlobTool::new()).await;

    match cli.command {
        Commands::Execute {
            timeout,
            working_dir,
            tool,
            parameter,
        } => {
            let mut args = ToolArgs::new(tool);
            for param in parameter {
                let parts: Vec<&str> = param.splitn(2, '=').collect();
                if parts.len() == 2 {
                    args = args.with_parameter(parts[0], serde_json::json!(parts[1]));
                }
            }
            if let Some(dir) = working_dir {
                args = args.with_working_dir(dir);
            }
            args = args.with_timeout(timeout);

            let result = registry.execute(args).await?;

            println!("Success: {}", result.success);
            println!("Output: {}", result.output);
            if let Some(error) = result.error {
                println!("Error: {}", error);
            }
        }
        Commands::List => {
            let tools = registry.list_all().await;

            println!("Available tools ({})\n", tools.len());
            for tool in tools {
                println!("Tool: {}", tool.name);
                println!("  Description: {}", tool.description);
                println!("  Parameters:");
                for param in tool.parameters {
                    let default_str = if let Some(default) = param.default_value {
                        format!(" (default: {})", default)
                    } else {
                        String::new()
                    };
                    println!("    - {} (type: {}) - {} - {}{}",
                             param.name, param.param_type, param.description,
                             if param.required { "required" } else { "optional" }, default_str);
                }
                println!();
            }
        }
        Commands::Info { tool } => {
            let tool_info = registry.list_all().await
                .into_iter()
                .find(|t| t.name == tool);

            match tool_info {
                Some(info) => {
                    println!("Tool: {}", info.name);
                    println!("Description: {}", info.description);
                    println!("Parameters:");
                    for param in info.parameters {
                        let default_str = if let Some(default) = param.default_value {
                            format!(" (default: {})", default)
                        } else {
                            String::new()
                        };
                        println!("  - {} (type: {}) - {} - {}{}",
                                 param.name, param.param_type, param.description,
                                 if param.required { "required" } else { "optional" }, default_str);
                    }
                }
                None => {
                    println!("Tool '{}' not found", tool);
                }
            }
        }
        Commands::AI { task, session_id, execute } => {
            let ai_client = AIServiceClient::new();
            
            println!("🤖 Sending task to AI service: {}", task);
            
            let request = crate::ai_service::TaskRequest {
                user_input: task.clone(),
                context: None,
                session_id,
            };
            
            match ai_client.process_task(request).await {
                Ok(response) => {
                    println!("\n✅ AI Response:");
                    println!("Success: {}", response.success);
                    println!("Reasoning: {}", response.reasoning);
                    
                    if response.requires_confirmation {
                        println!("⚠️  Requires confirmation before execution");
                    }
                    
                    if !response.tool_calls.is_empty() {
                        println!("\n🔧 Tool Calls ({}):", response.tool_calls.len());
                        for (i, tool_call) in response.tool_calls.iter().enumerate() {
                            println!("  {}. {} - {:?}", i + 1, tool_call.tool_name, tool_call.parameters);
                        }
                    }
                    
                    if let Some(error) = response.error {
                        println!("\n❌ Error: {}", error);
                    }
                    
                    if let Some(context) = response.context {
                        println!("\n📊 Context: {:?}", context);
                    }
                    
                    // Optionally execute the tool calls
                    if response.success && !response.tool_calls.is_empty() {
                        if execute {
                            println!("\n🚀 Executing tool calls...");
                            for tool_call in &response.tool_calls {
                                let args = ai_client.tool_call_to_args(tool_call);
                                match registry.execute(args).await {
                                    Ok(result) => {
                                        println!("\n📋 Tool '{}' completed:", tool_call.tool_name);
                                        println!("  Success: {}", result.success);
                                        println!("  Output: {}", result.output);
                                        if let Some(error) = result.error {
                                            println!("  Error: {}", error);
                                        }
                                    }
                                    Err(e) => {
                                        eprintln!("\n❌ Failed to execute tool '{}': {}", tool_call.tool_name, e);
                                    }
                                }
                            }
                        } else {
                            println!("\n💡 To execute these tool calls, use:");
                            for tool_call in &response.tool_calls {
                                print!("cargo run -- execute {} ", tool_call.tool_name);
                                for (key, value) in &tool_call.parameters {
                                    if let Some(str_val) = value.as_str() {
                                        print!("-p {}={} ", key, str_val);
                                    } else {
                                        print!("-p {}={} ", key, value);
                                    }
                                }
                                println!();
                            }
                            println!("\n💡 Or use --execute flag to run automatically:");
                            println!("cargo run -- ai \"{}\" --execute", task.replace("\"", "\\\""));
                        }
                    }
                }
                Err(e) => {
                    eprintln!("❌ Failed to communicate with AI service: {}", e);
                    eprintln!("Make sure to start the Python AI service:");
                    eprintln!("cd python-ai && source .venv/bin/activate && python -m app.simple_service");
                }
            }
        }
        Commands::AIHealth => {
            let ai_client = AIServiceClient::new();
            
            println!("🏥 Checking AI service health...");
            
            match ai_client.health_check().await {
                Ok(health) => {
                    println!("\n✅ AI Service Status:");
                    println!("  Status: {}", health.status);
                    println!("  Service: {}", health.service);
                    println!("  Version: {}", health.version);
                    println!("  Components:");
                    println!("    LLM Client: {}", if health.ai_components.llm { "✅" } else { "❌" });
                    println!("    Planner: {}", if health.ai_components.planner { "✅" } else { "❌" });
                    println!("    Experience Manager: {}", if health.ai_components.experience_manager { "✅" } else { "❌" });
                }
                Err(e) => {
                    eprintln!("❌ Failed to check AI service health: {}", e);
                    eprintln!("Make sure the Python AI service is running on http://localhost:8000");
                    eprintln!("Start it with: cd python-ai && python -m app.main");
                }
            }
        }
    }

    Ok(())
}