import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

export interface User {
  id: string;
  login: string;
  name: string;
  avatar: string;
  token: string;
  createdAt: string;
}

interface UsersFile {
  users: Record<string, User>;
}

async function loadUsers(): Promise<UsersFile> {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw) as UsersFile;
    if (parsed && typeof parsed.users === "object") return parsed;
  } catch {
    // first run
  }
  return { users: {} };
}

async function saveUsers(data: UsersFile) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function getUser(id: string): Promise<User | null> {
  const data = await loadUsers();
  return data.users[id] ?? null;
}

export async function getUsers(): Promise<Record<string, User>> {
  return (await loadUsers()).users;
}

export async function saveUser(user: User): Promise<void> {
  const data = await loadUsers();
  data.users[user.id] = user;
  await saveUsers(data);
}
