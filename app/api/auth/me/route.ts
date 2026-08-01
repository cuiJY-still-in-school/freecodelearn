import { NextResponse } from "next/server";
import { destroySession, getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { id: user.id, login: user.login, name: user.name, avatar: user.avatar },
  });
}

export async function DELETE() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
