import type { Metadata, Viewport } from "next";
import fs from "fs";
import path from "path";
import "./globals.css";
import Nav from "@/components/nav";
import UpdateBanner from "@/components/update-banner";
import ThemeInit from "@/components/theme-init";

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
      <head>
        {/* 首帧前应用主题,避免闪白/闪黑 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("fcl-theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme","light")}`,
          }}
        />
        {/* 首帧前应用排版偏好(字体/字号/阅读宽度) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=JSON.parse(localStorage.getItem("fcl-typography")||"{}");var h=document.documentElement;h.setAttribute("data-font",p.font==="serif"||p.font==="mono"?p.font:"default");h.setAttribute("data-size",p.size==="small"||p.size==="large"?p.size:"default");h.setAttribute("data-width",p.width==="narrow"||p.width==="wide"?p.width:"default")}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <ThemeInit />
        <UpdateBanner current={appVersion} />
        <Nav />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
