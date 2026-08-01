import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "github.json");

export interface GithubSettings {
  clientId: string;
  repoName: string;
}

export async function getGithubSettings(): Promise<GithubSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<GithubSettings>;
    return {
      clientId: String(parsed.clientId ?? ""),
      repoName: String(parsed.repoName ?? "freecodelearn-courses"),
    };
  } catch {
    return { clientId: "", repoName: "freecodelearn-courses" };
  }
}

export async function saveGithubSettings(
  settings: GithubSettings
): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
}

/* ---------- Device Flow ---------- */

export interface DeviceCodeInfo {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export async function requestDeviceCode(
  clientId: string
): Promise<DeviceCodeInfo> {
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ client_id: clientId, scope: "repo" }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      body?.error_description ?? `GitHub 设备授权失败 (${res.status})`
    );
  }
  return body as DeviceCodeInfo;
}

export interface PollResult {
  ok: boolean;
  accessToken?: string;
  error?: string;
  interval?: number;
}

export async function pollAccessToken(
  clientId: string,
  deviceCode: string
): Promise<PollResult> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  const body = await res.json();
  if (body.access_token) return { ok: true, accessToken: body.access_token };
  if (body.error === "authorization_pending") return { ok: false };
  if (body.error === "slow_down") {
    return { ok: false, error: "slow_down", interval: body.interval };
  }
  if (body.error === "access_denied") {
    return { ok: false, error: "access_denied" };
  }
  if (body.error === "expired_token") {
    return { ok: false, error: "expired_token" };
  }
  return { ok: false, error: body?.error ?? "unknown" };
}
