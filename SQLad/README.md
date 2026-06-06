# SQLad

本地 AI 数据便签。跟 AI 说话，数据自己出现。

## 运行

```bash
bun install
bun run build
cd src-tauri && cargo build --release
```

或开发模式：

```bash
bun run tauri dev
```

## 怎么用

- **左边**：跟 AI 说话。建表、查数据、调外部 API、自动定时任务——都是它的事。
- **右边**：数据出现后，点单元格直接改，列头右键排序/隐藏。
- **⚙️**：配 AI 大脑、看已连的服务、Webhook 地址。
- **拖文件**：CSV / JSON 直接丢窗口，自动建表。

## 技术栈

Tauri 2 · Rust · React 19 · MUI 6 · Glide Data Grid · SQLite · Axum

## 数据在哪

`~/.local/share/SQLad/`（Linux）/ 对应平台数据目录。
