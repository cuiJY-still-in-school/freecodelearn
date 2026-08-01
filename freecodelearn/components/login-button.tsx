"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AuthUser {
  id: string;
  login: string;
  name: string;
  avatar: string;
}

interface DeviceFlowState {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  interval: number;
  expiresIn: number;
}

export default function LoginButton() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [device, setDevice] = useState<DeviceFlowState | null>(null);
  const [deviceError, setDeviceError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const pollingRef = useRef(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (menuOpen && !(e.target as HTMLElement).closest("[data-login-menu]")) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  const pollDevice = useCallback(async (state: DeviceFlowState) => {
    pollingRef.current = true;
    const timeout = Date.now() + state.expiresIn * 1000;
    let interval = state.interval * 1000;
    while (Date.now() < timeout && pollingRef.current) {
      await new Promise((r) => setTimeout(r, interval));
      try {
        const res = await fetch("/api/auth/device/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceCode: state.deviceCode }),
        });
        const data = await res.json();
        if (data.ok && data.user) {
          setUser(data.user);
          setDevice(null);
          pollingRef.current = false;
          return;
        }
        if (data.failed) {
          setDeviceError(data.message ?? "登录失败");
          setDevice(null);
          pollingRef.current = false;
          return;
        }
        if (data.slowDown) interval += 5000;
      } catch {
        // 网络错误,继续轮询
      }
    }
    setDeviceError("授权超时,请重新发起登录");
    setDevice(null);
    pollingRef.current = false;
  }, []);

  async function startLogin() {
    setDeviceError("");
    try {
      const res = await fetch("/api/auth/device", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "发起登录失败");
      setDevice(data);
      pollDevice(data);
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : "发起登录失败");
    }
  }

  async function logout() {
    setMenuOpen(false);
    await fetch("/api/auth/me", { method: "DELETE" });
    setUser(null);
  }

  return (
    <>
      {user ? (
        <div className="relative" data-login-menu>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pl-1 pr-3 transition hover:border-accent/50"
          >
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar}
                alt={user.login}
                className="h-6 w-6 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
                {user.login.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="max-w-[8rem] truncate text-xs font-medium">
              {user.name || user.login}
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-line bg-card p-1.5 shadow-lg">
              <div className="px-3 py-2 text-xs text-ink-soft">
                @{user.login}
              </div>
              <button
                onClick={logout}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-soft transition hover:bg-red-soft hover:text-red"
              >
                退出登录
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={startLogin}
          className="flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-medium transition hover:border-accent/50 hover:text-accent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.082-.73.082-.73 1.205.085 1.838 1.237 1.838 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12Z" />
          </svg>
          登录
        </button>
      )}

      {device && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={() => {
            setDevice(null);
            pollingRef.current = false;
          }}
        >
          <div
            className="fade-up w-full max-w-md rounded-2xl border border-line bg-card p-8 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif text-xl font-bold">GitHub 登录</h3>
            <p className="mt-2 text-sm text-ink-soft">
              在新窗口打开以下链接,输入设备码完成授权
            </p>
            <a
              href={device.verificationUri}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block text-lg font-semibold text-accent underline underline-offset-4"
            >
              {device.verificationUri}
            </a>
            <div className="mt-5 rounded-xl border-2 border-dashed border-accent/40 bg-accent/5 py-4">
              <span className="font-mono text-3xl font-bold tracking-[0.3em] text-ink">
                {device.userCode}
              </span>
            </div>
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-ink-soft">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
              等待授权中...授权后自动进入
            </p>
            <button
              onClick={() => {
                setDevice(null);
                pollingRef.current = false;
              }}
              className="mt-5 rounded-xl border border-line px-5 py-2 text-sm text-ink-soft transition hover:text-red"
            >
              取消
            </button>
          </div>
        </div>
      )}
      {deviceError && (
        <div className="fixed inset-x-0 bottom-6 z-[60] mx-auto w-fit max-w-md rounded-xl border border-red-200 bg-card px-5 py-3 text-center text-sm text-red shadow-lg">
          {deviceError}
          <button
            onClick={() => setDeviceError("")}
            className="ml-3 text-ink-soft underline underline-offset-2 hover:text-red"
          >
            关闭
          </button>
        </div>
      )}
    </>
  );
}
