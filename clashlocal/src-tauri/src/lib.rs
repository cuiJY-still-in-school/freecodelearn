mod kernel;
mod sysproxy;

use serde::Serialize;
use tauri::Manager;

use kernel::process::CoreManager;
use kernel::profiles::{Profile, ProfileIndex};
use kernel::{CoreInfo, CONTROLLER_HOST, CONTROLLER_PORT};

#[derive(Serialize)]
struct RuntimeConfig {
    mixed_port: u16,
    controller: String,
    secret: String,
}

#[derive(Serialize)]
struct CoreStatus {
    running: bool,
    version: Option<String>,
    present: bool,
    uptime: u64,
}

/// 当前内核状态(是否存在 + 版本 + 路径)。
#[tauri::command]
fn get_core_info(app: tauri::AppHandle) -> CoreInfo {
    kernel::downloader::detect_core(&app)
}

/// 从 GitHub 下载/更新 mihomo 内核。
#[tauri::command]
async fn download_core(app: tauri::AppHandle) -> Result<CoreInfo, String> {
    kernel::downloader::download_core(app).await
}

/// 启动内核。
#[tauri::command]
fn start_core(app: tauri::AppHandle, mgr: tauri::State<CoreManager>) -> Result<(), String> {
    mgr.start(&app)
}

/// 停止内核。
#[tauri::command]
fn stop_core(mgr: tauri::State<CoreManager>) -> Result<(), String> {
    mgr.stop()
}

/// 重启内核。
#[tauri::command]
fn restart_core(app: tauri::AppHandle, mgr: tauri::State<CoreManager>) -> Result<(), String> {
    mgr.stop()?;
    mgr.start(&app)
}

/// 内核运行状态。
#[tauri::command]
fn core_status(app: tauri::AppHandle, mgr: tauri::State<CoreManager>) -> CoreStatus {
    let info = kernel::downloader::detect_core(&app);
    CoreStatus {
        running: mgr.is_running(),
        version: info.version,
        present: info.present,
        uptime: mgr.uptime().unwrap_or(0),
    }
}

/// 给前端的运行参数(端口 / controller / secret)。
#[tauri::command]
fn get_runtime_config(app: tauri::AppHandle) -> Result<RuntimeConfig, String> {
    let secret = kernel::config::ensure_secret(&app)?;
    Ok(RuntimeConfig {
        mixed_port: kernel::settings::load(&app).mixed_port,
        controller: format!("{CONTROLLER_HOST}:{CONTROLLER_PORT}"),
        secret,
    })
}

/// 开/关系统代理。
#[tauri::command]
fn set_system_proxy(app: tauri::AppHandle, enable: bool) -> Result<(), String> {
    if enable {
        sysproxy::enable(&app, kernel::settings::load(&app).mixed_port)
    } else {
        sysproxy::disable(&app)
    }
}

/// 系统代理是否正指向 clashlocal。
#[tauri::command]
fn system_proxy_status(app: tauri::AppHandle) -> bool {
    sysproxy::is_enabled(kernel::settings::load(&app).mixed_port)
}

/// 当前操作系统:"linux" / "windows" / "macos"。
#[tauri::command]
fn os_platform() -> String {
    std::env::consts::OS.to_string()
}

/// 本机局域网 IP(给"设备代理填 IP:7893"用)。
#[tauri::command]
fn lan_ip() -> Option<String> {
    kernel::hotspot::lan_ip()
}

/// 修改混合端口:存设置 → 重启内核 → 若系统代理原指向旧端口则重设到新端口。
#[tauri::command]
fn save_mixed_port(
    app: tauri::AppHandle,
    mgr: tauri::State<CoreManager>,
    port: u16,
) -> Result<(), String> {
    let mut s = kernel::settings::load(&app);
    let old = s.mixed_port;
    let proxy_on = sysproxy::is_enabled(old);
    s.mixed_port = port;
    kernel::settings::save(&app, &s)?;
    if mgr.is_running() {
        mgr.stop()?;
        mgr.start(&app)?;
    }
    if proxy_on {
        sysproxy::enable(&app, port)?;
    }
    Ok(())
}

/// 导入订阅(下载 + 存储);若是第一个订阅则自动激活。
#[tauri::command]
async fn import_profile(
    app: tauri::AppHandle,
    name: String,
    url: String,
) -> Result<Profile, String> {
    kernel::profiles::import_profile(app, name, url).await
}

/// 列出所有订阅 + 当前激活项。
#[tauri::command]
fn list_profiles(app: tauri::AppHandle) -> Result<ProfileIndex, String> {
    kernel::profiles::load_index(&app)
}

/// 激活订阅;若内核在运行则重启以生效。
#[tauri::command]
fn activate_profile(
    app: tauri::AppHandle,
    mgr: tauri::State<CoreManager>,
    uid: String,
) -> Result<(), String> {
    kernel::profiles::set_active(&app, uid)?;
    if mgr.is_running() {
        mgr.stop()?;
        mgr.start(&app)?;
    }
    Ok(())
}

/// 删除订阅;若内核在运行则重启(激活项可能已变)。
#[tauri::command]
fn delete_profile(
    app: tauri::AppHandle,
    mgr: tauri::State<CoreManager>,
    uid: String,
) -> Result<(), String> {
    kernel::profiles::delete(&app, uid)?;
    if mgr.is_running() {
        mgr.stop()?;
        mgr.start(&app)?;
    }
    Ok(())
}

/// 重新下载更新某订阅(不自动重启;前端按需对激活项调用 restart_core)。
#[tauri::command]
async fn update_profile(app: tauri::AppHandle, uid: String) -> Result<(), String> {
    kernel::profiles::update_profile(app, uid).await
}

/// 读取设置(透明代理开关 + 热点 SSID/密码)。
#[tauri::command]
fn get_settings(app: tauri::AppHandle) -> kernel::settings::Settings {
    kernel::settings::load(&app)
}

/// 设置应用启动时是否自动拉起内核。
#[tauri::command]
fn set_auto_start_core(app: tauri::AppHandle, enable: bool) -> Result<(), String> {
    let mut s = kernel::settings::load(&app);
    s.auto_start_core = enable;
    kernel::settings::save(&app, &s)
}

/// 保存热点 SSID/密码。
#[tauri::command]
fn save_hotspot_config(
    app: tauri::AppHandle,
    ssid: String,
    password: String,
    ifname: String,
    band: String,
) -> Result<(), String> {
    let mut s = kernel::settings::load(&app);
    s.hotspot_ssid = ssid;
    s.hotspot_password = password;
    s.hotspot_ifname = ifname;
    s.hotspot_band = band;
    kernel::settings::save(&app, &s)
}

/// 开热点(用已保存的 SSID/密码)。
#[tauri::command]
fn hotspot_start(app: tauri::AppHandle) -> Result<(), String> {
    let s = kernel::settings::load(&app);
    kernel::hotspot::start(&s.hotspot_ifname, &s.hotspot_band, &s.hotspot_ssid, &s.hotspot_password)
}

/// 列出可用作 AP 的 WiFi 网卡。
#[tauri::command]
fn list_wifi_devices() -> Vec<String> {
    kernel::hotspot::list_wifi_devices()
}

/// 关热点。
#[tauri::command]
fn hotspot_stop() -> Result<(), String> {
    kernel::hotspot::stop()
}

/// 热点状态(是否开启 + 子网/网关)。
#[tauri::command]
fn hotspot_status(app: tauri::AppHandle) -> kernel::hotspot::HotspotStatus {
    kernel::hotspot::status(&kernel::settings::load(&app).hotspot_ifname)
}

/// 透明代理开关:改设置 → 重启内核(应用 tproxy/dns)→ 应用/移除 nft 规则(需 root)。
#[tauri::command]
fn set_transparent(
    app: tauri::AppHandle,
    mgr: tauri::State<CoreManager>,
    enable: bool,
) -> Result<(), String> {
    let mut s = kernel::settings::load(&app);
    s.transparent = enable;
    kernel::settings::save(&app, &s)?;
    let bin = kernel::kernel_bin_path(&app)?;
    let bin = bin.to_string_lossy().to_string();
    if enable {
        // 先 setcap + 装 nft(root),再重启内核以绑定 tproxy
        let subnet = kernel::hotspot::subnet(&s.hotspot_ifname).unwrap_or_else(|| "10.42.0.0/24".to_string());
        kernel::transparent::enable(&subnet, kernel::TPROXY_PORT, &bin)?;
        if mgr.is_running() {
            mgr.stop()?;
            mgr.start(&app)?;
        }
    } else {
        // 先重启内核(去掉 tproxy 配置),再清 nft + 去 cap
        if mgr.is_running() {
            mgr.stop()?;
            mgr.start(&app)?;
        }
        kernel::transparent::disable(&bin)?;
    }
    Ok(())
}

/// 构建系统托盘 + 关窗到托盘(而非退出)。
fn setup_tray_and_window(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let show = MenuItem::with_id(app, "show", "显示主界面", true, None::<&str>)?;
    let core = MenuItem::with_id(app, "toggle-core", "内核 开 / 关", true, None::<&str>)?;
    let proxy = MenuItem::with_id(app, "toggle-proxy", "系统代理 开 / 关", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 clashlocal", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &core, &proxy, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("clashlocal")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
            "toggle-core" => {
                if let Some(mgr) = app.try_state::<CoreManager>() {
                    if mgr.is_running() {
                        let _ = mgr.stop();
                    } else {
                        let _ = mgr.start(app);
                    }
                }
            }
            "toggle-proxy" => {
                let port = kernel::settings::load(app).mixed_port;
                if sysproxy::is_enabled(port) {
                    let _ = sysproxy::disable(app);
                } else {
                    let _ = sysproxy::enable(app, port);
                }
            }
            "quit" => {
                let s = kernel::settings::load(app);
                if s.transparent {
                    if let Ok(bin) = kernel::kernel_bin_path(app) {
                        let _ = kernel::transparent::disable(&bin.to_string_lossy());
                    }
                }
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(w) = tray.app_handle().get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;

    if let Some(win) = app.get_webview_window("main") {
        let w = win.clone();
        win.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = w.hide();
                api.prevent_close();
            }
        });
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CoreManager::default())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            setup_tray_and_window(app)?;
            if kernel::settings::load(app.handle()).auto_start_core {
                if let Some(mgr) = app.try_state::<CoreManager>() {
                    let _ = mgr.start(app.handle());
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_core_info,
            download_core,
            start_core,
            stop_core,
            restart_core,
            core_status,
            get_runtime_config,
            set_system_proxy,
            system_proxy_status,
            os_platform,
            lan_ip,
            import_profile,
            list_profiles,
            activate_profile,
            delete_profile,
            update_profile,
            get_settings,
            save_hotspot_config,
            hotspot_start,
            hotspot_stop,
            hotspot_status,
            list_wifi_devices,
            set_transparent,
            set_auto_start_core,
            save_mixed_port
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // 退出时清理:停内核、还原系统代理、关热点(透明 nft 清理在托盘"退出"里做)。
            if let tauri::RunEvent::Exit = event {
                if let Some(mgr) = app_handle.try_state::<CoreManager>() {
                    let _ = mgr.stop();
                }
                let port = kernel::settings::load(app_handle).mixed_port;
                if sysproxy::is_enabled(port) {
                    let _ = sysproxy::disable(app_handle);
                }
                let _ = kernel::hotspot::stop();
            }
        });
}
