use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use crate::kernel::{config, kernel_bin_path};

/// 托管 mihomo 子进程的运行态。作为 Tauri managed state。
#[derive(Default)]
pub struct CoreManager {
    child: Mutex<Option<Child>>,
}

impl CoreManager {
    /// 是否在运行(顺便回收已退出的子进程句柄)。
    pub fn is_running(&self) -> bool {
        let mut guard = self.child.lock().unwrap();
        match guard.as_mut() {
            Some(c) => match c.try_wait() {
                Ok(None) => true,
                _ => {
                    *guard = None;
                    false
                }
            },
            None => false,
        }
    }

    /// 启动内核(已在运行则直接返回)。
    pub fn start(&self, app: &tauri::AppHandle) -> Result<(), String> {
        if self.is_running() {
            return Ok(());
        }
        let bin = kernel_bin_path(app)?;
        if !bin.exists() {
            return Err("mihomo 内核不存在,请先在首页下载内核".into());
        }
        let dir = config::run_dir(app)?;
        let (cfg, _secret) = config::write_config(app)?;
        let log = std::fs::File::create(dir.join("mihomo.log"))
            .map_err(|e| format!("创建内核日志失败: {e}"))?;
        let log_err = log.try_clone().map_err(|e| format!("日志句柄复制失败: {e}"))?;
        let mut cmd = Command::new(&bin);
        cmd.arg("-d")
            .arg(&dir)
            .arg("-f")
            .arg(&cfg)
            .stdout(Stdio::from(log))
            .stderr(Stdio::from(log_err));
        // Windows:隐藏 mihomo 的控制台黑窗
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let child = cmd.spawn().map_err(|e| format!("启动 mihomo 失败: {e}"))?;
        log::info!("mihomo 已启动 pid={}", child.id());
        *self.child.lock().unwrap() = Some(child);
        Ok(())
    }

    /// 停止内核。
    pub fn stop(&self) -> Result<(), String> {
        let mut guard = self.child.lock().unwrap();
        if let Some(mut c) = guard.take() {
            let _ = c.kill();
            let _ = c.wait();
            log::info!("mihomo 已停止");
        }
        Ok(())
    }
}
