import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, createRepo, uploadFile } from "@/lib/auth";
import { getGithubSettings } from "@/lib/github";
import { getCourse, saveCourse, toMeta } from "@/lib/store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录 GitHub" }, { status: 401 });
  }
  const course = await getCourse(id);
  if (!course) {
    return NextResponse.json({ error: "课程不存在" }, { status: 404 });
  }

  const { repoName } = await getGithubSettings();
  try {
    // 确保仓库存在(不存在则自动创建)
    try {
      await uploadFile(
        user.token,
        user.login,
        repoName,
        "README.md",
        "# FreeCodeLearn 公开课程\n\n由 FreeCodeLearn 自动同步的公开课程。\n",
        "chore: init repo"
      );
    } catch {
      await createRepo(user.token, repoName);
      await uploadFile(
        user.token,
        user.login,
        repoName,
        "README.md",
        "# FreeCodeLearn 公开课程\n\n由 FreeCodeLearn 自动同步的公开课程。\n",
        "chore: init repo"
      );
    }

    const filePath = `courses/${course.id}.json`;
    const content = JSON.stringify({ ...course, isPublic: true, ownerLogin: user.login }, null, 2);
    await uploadFile(
      user.token,
      user.login,
      repoName,
      filePath,
      content,
      `publish course: ${course.title}`
    );

    // 更新本地课程
    course.isPublic = true;
    course.ownerLogin = user.login;
    course.ownerId = user.id;
    await saveCourse(course);

    return NextResponse.json({ ok: true, course: toMeta(course) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "发布失败" },
      { status: 500 }
    );
  }
}

/* ---------- 取消发布 ---------- */

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) {
    return NextResponse.json({ error: "课程不存在" }, { status: 404 });
  }
  course.isPublic = false;
  course.ownerLogin = undefined;
  await saveCourse(course);
  return NextResponse.json({ ok: true, course: toMeta(course) });
}
