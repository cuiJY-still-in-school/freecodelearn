pub mod ai;
pub mod automation;
pub mod commands;
pub mod core;
pub mod credentials;
pub mod importer;
pub mod mods;
pub mod state;
pub mod storage;
pub mod tools;
pub mod webhook;

use automation::TriggerStore;
use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("sqlad=info,warn")),
        )
        .try_init()
        .ok();

    let app_state = AppState::bootstrap().expect("failed to bootstrap SQLad state");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(app_state)
        .setup(|app| {
            let state = app.state::<AppState>();
            let registry = state.registry.clone();
            let credentials = state.credentials.clone();
            let data_dir = state.data_dir.clone();
            let port = *state.webhook_port.read();

            let wh_state = webhook::WebhookAppState {
                registry,
                triggers: TriggerStore::load(&data_dir).unwrap_or_default(),
                credentials,
            };
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().expect("webhook runtime");
                // Retry with next port if default is taken
                let mut p = port;
                for attempt in 0..5 {
                    match rt.block_on(webhook::start_server(wh_state.clone(), p)) {
                        Ok(_) => break,
                        Err(e) => {
                            if attempt < 4 && e.to_string().contains("被占用") {
                                p += 1;
                                continue;
                            }
                            tracing::warn!("webhook server failed: {e}");
                            break;
                        }
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::list_storage_adapters,
            commands::list_ai_providers,
            commands::upsert_provider,
            commands::delete_provider,
            commands::set_default_provider,
            commands::test_provider,
            commands::list_tools,
            commands::list_tables,
            commands::create_table,
            commands::drop_table,
            commands::insert_blank_row,
            commands::update_cell,
            commands::delete_rows,
            commands::add_column,
            commands::rename_column,
            commands::drop_column,
            commands::run_query,
            commands::import_data,
            commands::chat,
            commands::invoke_tool,
            commands::data_dir,
            commands::list_triggers,
            commands::save_trigger,
            commands::delete_trigger,
            commands::evaluate_trigger,
            commands::mark_trigger,
            commands::list_credentials,
            commands::save_credential,
            commands::delete_credential,
            commands::list_service_mods,
            commands::mods_dir,
            commands::open_path,
            commands::save_text_file,
            commands::fetch_and_save_mod,
            commands::webhook_status,
            commands::webhook_port,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SQLad");
}
