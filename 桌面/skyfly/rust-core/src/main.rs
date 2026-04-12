mod tools;

use crate::tools::{ToolRegistry, ToolArgs, BashTool, ReadTool, WriteTool, EditTool, GlobTool};
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
    }

    Ok(())
}