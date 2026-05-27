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

/// 探测无线网卡能力(支不支持 AP、能否并发、频段),给热点页判断与建议用。
#[tauri::command]
fn wifi_capability(app: tauri::AppHandle) -> kernel::hotspot::WifiCapability {
    kernel::hotspot::wifi_capability(&kernel::settings::load(&app).hotspot_ifname)
}

/// 本机 station 当前频段:"2.4GHz" / "5GHz" / ""。并发热点需 2.4GHz。
#[tauri::command]
fn station_band(app: tauri::AppHandle) -> String {
    kernel::hotspot::station_band(&kernel::settings::load(&app).hotspot_ifname)
}

/// 并发热点状态(本机不脱网的虚拟 AP 是否在跑)。
#[tauri::command]
fn concurrent_hotspot_status() -> bool {
    kernel::hotspot::concurrent_active()
}

/// 开并发热点:本机原 WiFi 不断,同网卡虚拟 AP 同信道发热点,客户端经透明代理走 VPN。
/// 需已授权;会顺带开启透明代理配置(tproxy-port)并给内核 setcap、重启内核。
#[tauri::command]
fn concurrent_hotspot_start(
    app: tauri::AppHandle,
    mgr: tauri::State<CoreManager>,
) -> Result<(), String> {
    let mut s = kernel::settings::load(&app);
    let bin = kernel::kernel_bin_path(&app)?;
    let bin = bin.to_string_lossy().to_string();

    // 并发热点要求 AP 与本机 WiFi 同信道,而 5GHz 信道多为 No-IR 不能当 AP。
    // 本机若在 5G,自动把当前 WiFi 切到 2.4G(锁 band bg 重连),关闭时再还原。
    match kernel::hotspot::station_band(&s.hotspot_ifname).as_str() {
        "5GHz" => {
            let con = kernel::hotspot::active_wifi_con(&s.hotspot_ifname)
                .ok_or_else(|| "未找到本机当前 WiFi 连接,无法自动切换到 2.4G".to_string())?;
            kernel::privilege::run(&["band24", &con])?;
            std::thread::sleep(std::time::Duration::from_secs(4));
            if kernel::hotspot::station_band(&s.hotspot_ifname) != "2.4GHz" {
                let _ = kernel::privilege::run(&["bandauto", &con]);
                return Err(
                    "已尝试把本机切到 2.4G 但没连上(路由器可能没开 2.4GHz)。并发热点需要 2.4G。"
                        .into(),
                );
            }
            s.auto_band_switched = true;
        }
        "" => return Err("本机未连任何 WiFi;并发热点需要本机先连一个 2.4GHz WiFi 作为上游。".into()),
        _ => {}
    }

    // 内核需带 tproxy-port + CAP_NET_ADMIN,客户端流量才能被 TPROXY 接住
    kernel::privilege::set_caps(&bin, true)?;
    s.transparent = true;
    kernel::settings::save(&app, &s)?;
    if mgr.is_running() {
        mgr.stop()?;
    }
    mgr.start(&app)?;
    // 起虚拟 AP + dnsmasq + nft TPROXY(频段不对/未授权会返回友好错误)
    kernel::hotspot::concurrent_start(
        &s.hotspot_ifname,
        &s.hotspot_ssid,
        &s.hotspot_password,
        kernel::TPROXY_PORT,
    )
}

/// 关并发热点:停虚拟 AP/dnsmasq + 清 nft;关透明代理配置并重启内核还原。
#[tauri::command]
fn concurrent_hotspot_stop(
    app: tauri::AppHandle,
    mgr: tauri::State<CoreManager>,
) -> Result<(), String> {
    let mut s = kernel::settings::load(&app);
    kernel::hotspot::concurrent_stop(&s.hotspot_ifname)?;
    s.transparent = false;
    // 还原开热点时自动切到的 2.4G(切回 band 自动,通常回到 5G)
    if s.auto_band_switched {
        if let Some(con) = kernel::hotspot::active_wifi_con(&s.hotspot_ifname) {
            let _ = kernel::privilege::run(&["bandauto", &con]);
        }
        s.auto_band_switched = false;
    }
    kernel::settings::save(&app, &s)?;
    if mgr.is_running() {
        mgr.stop()?;
        mgr.start(&app)?;
    }
    if s.local_mode != "tun" {
        let bin = kernel::kernel_bin_path(&app)?;
        let _ = kernel::privilege::set_caps(&bin.to_string_lossy(), false);
    }
    Ok(())
}

/// 是否已完成一次性管理员授权。
#[tauri::command]
fn admin_granted() -> bool {
    kernel::privilege::is_granted()
}

/// 一次性管理员授权(装 root 助手 + sudoers 免密)。
#[tauri::command]
fn grant_admin() -> Result<(), String> {
    kernel::privilege::grant()
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
    let bin = kernel::kernel_bin_path(&app)?;
    let bin = bin.to_string_lossy().to_string();
    if enable {
        // 先 setcap + 装 nft(root),再重启内核以绑定 tproxy
        kernel::privilege::set_caps(&bin, true)?;
        let subnet = kernel::hotspot::subnet(&s.hotspot_ifname).unwrap_or_else(|| "10.42.0.0/24".to_string());
        kernel::transparent::enable(&subnet, kernel::TPROXY_PORT)?;
        kernel::settings::save(&app, &s)?;
        if mgr.is_running() {
            mgr.stop()?;
            mgr.start(&app)?;
        }
    } else {
        kernel::settings::save(&app, &s)?;
        // 先重启内核(去掉 tproxy 配置),再清 nft;TUN 模式仍需 caps,故仅在非 TUN 时去 cap
        if mgr.is_running() {
            mgr.stop()?;
            mgr.start(&app)?;
        }
        kernel::transparent::disable()?;
        if s.local_mode != "tun" {
            let _ = kernel::privilege::set_caps(&bin, false);
        }
    }
    Ok(())
}

/// 本机网络模式:"system" 系统代理 / "tun" 全局 TUN / "none" 直连。
/// TUN 需先完成一次性授权(创建 tun 设备要 CAP_NET_ADMIN);三种模式互斥。
#[tauri::command]
fn set_local_mode(
    app: tauri::AppHandle,
    mgr: tauri::State<CoreManager>,
    mode: String,
) -> Result<(), String> {
    let mut s = kernel::settings::load(&app);
    let bin = kernel::kernel_bin_path(&app)?;
    let bin = bin.to_string_lossy().to_string();

    if mode == "tun" {
        // 先确保有 caps(未授权会返回"请先授权"),失败则不改设置
        kernel::privilege::set_caps(&bin, true)?;
    }
    s.local_mode = mode.clone();
    kernel::settings::save(&app, &s)?;

    // 非 system 模式:关掉系统代理
    if mode != "system" {
        let _ = sysproxy::disable(&app);
    }
    // 非 tun 且非透明代理:去掉 caps
    if mode != "tun" && !s.transparent {
        let _ = kernel::privilege::set_caps(&bin, false);
    }
    // 应用 config(tun on/off)
    if mgr.is_running() {
        mgr.stop()?;
        mgr.start(&app)?;
    }
    // system 模式:开系统代理指向当前端口
    if mode == "system" {
        sysproxy::enable(&app, s.mixed_port)?;
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
                if kernel::hotspot::concurrent_active() {
                    let _ = kernel::hotspot::concurrent_stop(&s.hotspot_ifname);
                }
                if s.transparent {
                    let _ = kernel::transparent::disable();
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
            set_local_mode,
            wifi_capability,
            station_band,
            concurrent_hotspot_status,
            concurrent_hotspot_start,
            concurrent_hotspot_stop,
            set_auto_start_core,
            save_mixed_port,
            admin_granted,
            grant_admin
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
