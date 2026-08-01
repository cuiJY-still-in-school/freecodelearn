import { cookies } from "next/headers";
import { getUser, saveUser, type User } from "./users";

const SESSION_COOKIE = "fcl_session";

/* ---------- GitHub API 调用 ---------- */

const GH_API = "https://api.github.com";

async function gh(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${GH_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(
      `GitHub API 失败 (${res.status}): ${body?.message ?? text.slice(0, 200)}`
    );
  }
  return body;
}

export async function fetchUser(token: string) {
  return gh("/user", token);
}

export async function fetchRepos(token: string, perPage = 100) {
  return gh(`/user/repos?per_page=${perPage}&sort=updated`, token);
}

export async function createRepo(token: string, name: string) {
  return gh("/user/repos", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, private: false, auto_init: true }),
  });
}

export async function uploadFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string
) {
  return gh(`/repos/${owner}/${repo}/contents/${path}`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
    }),
  });
}

/* ---------- 会话 ---------- */

export async function createSession(user: User) {
  (await cookies()).set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<User | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return getUser(id);
}

export async function loginWithToken(token: string): Promise<User> {
  const info = await fetchUser(token);
  const user: User = {
    id: String(info.id),
    login: String(info.login),
    name: String(info.name ?? info.login),
    avatar: String(info.avatar_url ?? ""),
    token,
    createdAt: new Date().toISOString(),
  };
  await saveUser(user);
  await createSession(user);
  return user;
}
