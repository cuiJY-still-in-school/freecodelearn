import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import "./globals.css";
import Nav from "@/components/nav";
import UpdateBanner from "@/components/update-banner";

export const metadata: Metadata = {
  title: "FreeCodeLearn - AI 生成编程课程",
  description: "输入主题,AI 几分钟生成一门 freeCodeCamp 风格的编程课程,含图文章节、代码挑战、自动判题与测验",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#1c1917",
  width: "device-width",
  initialScale: 1,
};

import type { Viewport } from "next";

const appVersion: string = (() => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <UpdateBanner current={appVersion} />
        <Nav />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
