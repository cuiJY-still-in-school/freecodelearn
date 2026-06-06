/** Pre-defined connectable services + per-service AI hints.
 *
 *  All entries (built-in + user mods) share this shape. Mods are simple JSON
 *  files dropped into `<data_dir>/mods/`; the schema below documents what
 *  fields they can set.
 */

export type ServiceCategory =
  | "messaging"
  | "dev"
  | "ai"
  | "data"
  | "productivity"
  | "other";

export interface AiHint {
  /** Short label shown as a chip ("发条消息" / "拉最新 50 条…") */
  label: string;
  /** Full prompt the user can copy / AI auto-runs. Templates: {credential},
   *  {channel}, {to}, {message}. */
  prompt: string;
}

export interface ServiceCatalogEntry {
  /** Unique id used as the credential name by default. */
  id: string;
  name: string;
  /** One-line tagline shown on the card. */
  blurb: string;
  /** Emoji or short text fallback icon (we don't ship vendor logos). */
  icon: string;
  /** Tailwind-ish color for the card accent. */
  color: string;
  /** Where the user goes to create a token / webhook. */
  tokenUrl: string;
  /** How to inject the token: bearer | header:X-Foo | query:p | none */
  scheme: string;
  /** Service category. */
  category: ServiceCategory;
  /** Short blurbs displayed under the card. */
  capabilities: string[];
  /** Markdown-flavored step-by-step. */
  howTo: string;
  /** Starter prompt seeded when user picks "Let AI guide me". */
  aiSeed: string;
  /** Hint stored alongside the credential. */
  defaultHint: string;
  /** Per-service AI prompt templates shown as quick-start chips. */
  aiHints?: AiHint[];
  /** Set by the loader; mods that override builtins win. Not for catalog
   *  authors to set. */
  source?: "builtin" | "mod";
  /** For mod-sourced entries, the path of the mod file. */
  modPath?: string;
}

export const BUILTIN_CATALOG: ServiceCatalogEntry[] = [
  // -------------------- Messaging --------------------
  {
    id: "slack",
    name: "Slack",
    blurb: "发消息 / 读频道",
    icon: "#",
    color: "#4a154b",
    tokenUrl: "https://api.slack.com/apps",
    scheme: "bearer",
    category: "messaging",
    capabilities: ["往频道发消息", "读 channel 历史", "触发器收到事件就通知"],
    howTo: [
      "1. 打开 Slack apps 页面 → **Create New App** → From scratch",
      "2. 选 workspace，起个名（如 SQLad）",
      "3. 左栏 **OAuth & Permissions** → Bot Token Scopes 加 `chat:write`（发消息）+ `channels:history`（读）",
      "4. 顶部 **Install to Workspace**，授权",
      "5. 复制 **Bot User OAuth Token**（以 xoxb- 开头）",
      "6. 粘贴 → 保存",
    ].join("\n"),
    aiSeed:
      "我刚连上 Slack。用 fetch_url credential='slack' GET https://slack.com/api/auth.test 验证一下，告诉我能看到哪些 channel。",
    defaultHint: "Slack Bot User OAuth Token",
    aiHints: [
      {
        label: "发条消息",
        prompt:
          "用 fetch_url credential='slack' POST https://slack.com/api/chat.postMessage，body={channel:'#general', text:'你好'}，把消息发到 #general（替换成实际频道）。",
      },
      {
        label: "拉最近 50 条",
        prompt:
          "用 fetch_url credential='slack' GET https://slack.com/api/conversations.history?channel=<channel_id>&limit=50，存到表 slack_messages（不存在就建）。",
      },
    ],
  },
  {
    id: "discord",
    name: "Discord (Bot)",
    blurb: "发消息 / 读频道 / 加 reaction",
    icon: "DC",
    color: "#5865f2",
    tokenUrl: "https://discord.com/developers/applications",
    scheme: "header:Authorization",
    category: "messaging",
    capabilities: ["往频道发消息", "读 channel 历史"],
    howTo: [
      "1. 打开 Discord Developer Portal",
      "2. **New Application** → 起名 → 左栏 **Bot** → **Add Bot**",
      "3. 复制 **Token**（点 Reset Token 显示）",
      "4. 在 OAuth2 → URL Generator 勾 scope=bot + 权限（Send Messages 等），把生成的 URL 在浏览器打开邀请到你的服务器",
      "5. 粘贴 Token → 注入方式选 **header:Authorization**（值会自动加 `Bot ` 前缀，由你手动改）",
      "6. 保存",
    ].join("\n"),
    aiSeed:
      "我刚连上 Discord Bot。Discord API 的 Authorization 头需要 'Bot <token>' 格式，提醒我把凭证里的值改成 'Bot xxx' 或者用 header 方案手动写。然后调 GET https://discord.com/api/v10/users/@me 验证。",
    defaultHint: "Discord Bot Token（值前面要加 'Bot '）",
    aiHints: [
      {
        label: "发消息到频道",
        prompt:
          "fetch_url credential='discord' POST https://discord.com/api/v10/channels/<channel_id>/messages，body={content:'你好'}。",
      },
    ],
  },
  {
    id: "telegram",
    name: "Telegram Bot",
    blurb: "Bot 发 / 收消息",
    icon: "TG",
    color: "#229ed9",
    tokenUrl: "https://t.me/BotFather",
    scheme: "none",
    category: "messaging",
    capabilities: ["往 chat 发消息", "轮询拉新消息"],
    howTo: [
      "1. 在 Telegram 找 **@BotFather** 对话",
      "2. /newbot → 起名 → 取得 token（形如 `123456:ABC...`）",
      "3. 把 token 粘到下面，**注入方式选 `none`**（Telegram 把 token 放 URL 里）",
      "4. 保存",
      "5. 发条消息给你的 bot 一次（让它能拿到 chat_id），之后让 AI 用 getUpdates 找 chat_id",
    ].join("\n"),
    aiSeed:
      "我刚连上 Telegram Bot。先调 fetch_url GET https://api.telegram.org/bot<我的 token>/getMe 验证 —— 但是 token 在凭证库，你看不到。改用 fetch_url credential='telegram'，URL 里用占位 https://api.telegram.org/bot{TOKEN}/getMe，不过 SQLad 不展开占位。所以这个服务最简单的用法是直接让用户告诉 AI token 太敏感。建议改成把 token 拼进 URL 但保存为 query 方案。",
    defaultHint: "Telegram Bot token",
    aiHints: [
      {
        label: "发条消息",
        prompt:
          "Telegram 把 token 放 URL 里。先 list_credentials 看是否已经把 telegram token 作为 query 凭证保存。然后 fetch_url POST https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<chat>&text=<msg>。",
      },
    ],
  },
  {
    id: "feishu",
    name: "飞书 / Lark",
    blurb: "群机器人发消息（webhook）",
    icon: "FS",
    color: "#00d6b9",
    tokenUrl:
      "https://www.feishu.cn/hc/zh-CN/articles/360024984973",
    scheme: "none",
    category: "messaging",
    capabilities: ["往群发卡片 / 文本消息"],
    howTo: [
      "1. 在飞书群里 → 设置 → **群机器人** → 添加 → **自定义机器人**",
      "2. 复制 **Webhook 地址**（形如 https://open.feishu.cn/open-apis/bot/v2/hook/...）",
      "3. **把整条 webhook URL 当作 token 粘进来**，注入方式选 `none`（这条 URL 本身就是凭证）",
      "4. 保存",
    ].join("\n"),
    aiSeed:
      "我刚连上飞书群机器人。webhook URL 已经存在凭证 'feishu' 里（list_credentials 看 hint）。我想发条消息，但 fetch_url 不能把整个凭证当 URL 用，所以让用户在新建自动化时把 webhook URL 复制到 'URL' 字段，body 用 `{msg_type:'text', content:{text:'内容'}}`。",
    defaultHint: "飞书群机器人 webhook URL",
    aiHints: [
      {
        label: "发文本消息（用户填 webhook URL）",
        prompt:
          "向用户问飞书 webhook URL，然后 fetch_url POST 这个 URL，body={msg_type:'text', content:{text:'你要说的话'}}",
      },
    ],
  },
  {
    id: "dingtalk",
    name: "钉钉",
    blurb: "群机器人发消息（webhook）",
    icon: "DD",
    color: "#0089ff",
    tokenUrl:
      "https://open.dingtalk.com/document/robots/custom-robot-access",
    scheme: "none",
    category: "messaging",
    capabilities: ["往群发 text / markdown / link 消息"],
    howTo: [
      "1. 在钉钉群里 → 群设置 → **智能群助手** → 添加机器人 → 自定义",
      "2. 安全设置选「自定义关键词」或「IP 段」（webhook 模式），获取 webhook URL",
      "3. 复制 webhook URL，**整条 URL 当 token 粘进来**，注入方式 `none`",
      "4. 保存",
    ].join("\n"),
    aiSeed:
      "钉钉群机器人 webhook URL 是凭证。让我提示用户在自动化里把 webhook 填进 fetch_url 的 URL 字段，body={msgtype:'text', text:{content:'消息内容'}}。",
    defaultHint: "钉钉群机器人 webhook URL",
    aiHints: [
      {
        label: "发 markdown 消息",
        prompt:
          "向用户要钉钉 webhook URL，然后 fetch_url POST URL，body={msgtype:'markdown', markdown:{title:'通知',text:'## 标题\\n...'}}",
      },
    ],
  },
  {
    id: "wecom",
    name: "企业微信",
    blurb: "群机器人发消息（webhook）",
    icon: "WX",
    color: "#07c160",
    tokenUrl:
      "https://developer.work.weixin.qq.com/document/path/91770",
    scheme: "none",
    category: "messaging",
    capabilities: ["往群发 text / markdown 消息"],
    howTo: [
      "1. 在企业微信群里 → 添加群机器人 → 复制 webhook URL（含 key 参数）",
      "2. 整条 URL 当 token 粘进来，注入方式 `none`",
      "3. 保存",
    ].join("\n"),
    aiSeed:
      "企业微信群机器人 webhook 已存为凭证。让我用 fetch_url POST <webhook URL> body={msgtype:'text', text:{content:'…'}} 发消息。",
    defaultHint: "企业微信群机器人 webhook URL",
    aiHints: [
      {
        label: "发文本",
        prompt:
          "向用户要企业微信 webhook URL，fetch_url POST URL，body={msgtype:'text', text:{content:'消息'}}",
      },
    ],
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    blurb: "Incoming Webhook 发卡片",
    icon: "MT",
    color: "#4b53bc",
    tokenUrl:
      "https://learn.microsoft.com/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook",
    scheme: "none",
    category: "messaging",
    capabilities: ["往频道发卡片消息"],
    howTo: [
      "1. 在 Teams 频道右上 ⋯ → **Connectors** → Incoming Webhook → Configure",
      "2. 起名 + 头像，复制 webhook URL",
      "3. 整条 URL 当 token 粘进来，注入方式 `none`",
      "4. 保存",
    ].join("\n"),
    aiSeed:
      "Teams Incoming Webhook 已存为凭证。POST 到 webhook URL，body 是 MessageCard 或 Adaptive Card。让我帮用户发一个测试卡片。",
    defaultHint: "Teams Incoming Webhook URL",
    aiHints: [
      {
        label: "发简单卡片",
        prompt:
          "向用户要 Teams webhook URL，fetch_url POST URL，body={'@type':'MessageCard','@context':'https://schema.org/extensions','summary':'测试','text':'你好'}",
      },
    ],
  },
  {
    id: "twilio",
    name: "Twilio SMS",
    blurb: "发短信",
    icon: "TW",
    color: "#f22f46",
    tokenUrl: "https://console.twilio.com/",
    scheme: "header:Authorization",
    category: "messaging",
    capabilities: ["发短信", "查送达状态"],
    howTo: [
      "1. 打开 Twilio Console，注册 / 登录",
      "2. 拿到 **Account SID** 和 **Auth Token**",
      "3. 凭证 value 填 `Basic base64(AccountSID:AuthToken)`（手动拼）",
      "4. 注入方式选 **header:Authorization**",
      "5. 你还需要一个 Twilio 号码做主叫",
    ].join("\n"),
    aiSeed:
      "Twilio 凭证已加。我帮用户发条短信：fetch_url POST https://api.twilio.com/2010-04-01/Accounts/<SID>/Messages.json，body=From=<号码>&To=<目标>&Body=…。",
    defaultHint: "Twilio Basic auth (Basic base64)",
    aiHints: [
      {
        label: "发短信",
        prompt:
          "向用户要 Account SID、from 号、to 号、内容。fetch_url POST https://api.twilio.com/2010-04-01/Accounts/<SID>/Messages.json，body=From=...&To=...&Body=...，header content-type=application/x-www-form-urlencoded。",
      },
    ],
  },
  {
    id: "resend",
    name: "Resend (邮件)",
    blurb: "发邮件 API",
    icon: "RE",
    color: "#000000",
    tokenUrl: "https://resend.com/api-keys",
    scheme: "bearer",
    category: "messaging",
    capabilities: ["发事务邮件", "看发送日志"],
    howTo: [
      "1. 去 Resend 注册 + 验证域名（或用 onboarding@resend.dev 测试）",
      "2. API Keys 页面 **Create API Key**",
      "3. 复制 key（re_… 开头）",
      "4. 粘贴 → 保存",
    ].join("\n"),
    aiSeed:
      "Resend 已加。我帮用户发封邮件：fetch_url credential='resend' POST https://api.resend.com/emails，body={from:'me@x.com', to:'…', subject:'…', html:'…'}。",
    defaultHint: "Resend API Key",
    aiHints: [
      {
        label: "发邮件",
        prompt:
          "fetch_url credential='resend' POST https://api.resend.com/emails，body={from,to,subject,html}，from 必须在已验证域名上。",
      },
    ],
  },
  {
    id: "webhook-generic",
    name: "通用 Webhook",
    blurb: "任何 POST 接收方（Zapier / Make / 自建）",
    icon: "→",
    color: "#6366f1",
    tokenUrl: "https://example.com",
    scheme: "none",
    category: "messaging",
    capabilities: ["把数据 POST 给任意 URL", "对接 Zapier / Make / n8n / 自建"],
    howTo: [
      "1. 你的接收端给你一个 URL（如 Zapier Webhook、Make scenario、自己起的服务）",
      "2. 整条 URL 粘进来作 token",
      "3. 注入方式 `none`（你直接告诉 AI URL 是哪个）",
    ].join("\n"),
    aiSeed:
      "通用 webhook 已加。让我把数据 POST 出去：用户给我 URL，我用 fetch_url POST 那个 URL，body 是 JSON。",
    defaultHint: "Webhook URL",
    aiHints: [
      {
        label: "POST 一段 JSON",
        prompt:
          "向用户要 webhook URL 和要发送的 JSON 结构，fetch_url POST URL，body=对象自动 JSON 化。",
      },
    ],
  },
  {
    id: "smtp-via-resend",
    name: "Email (自建 SMTP，规划中)",
    blurb: "标准 SMTP（暂未支持，建议用 Resend）",
    icon: "✉",
    color: "#94a3b8",
    tokenUrl: "https://resend.com",
    scheme: "none",
    category: "messaging",
    capabilities: ["—"],
    howTo:
      "SQLad 后端目前没内置 SMTP 客户端。临时建议：用上面的 **Resend** 集成；或者让 AI 通过 fetch_url 调你自己的小 SMTP-relay 服务。",
    aiSeed: "用户问到 SMTP，告诉他用 Resend 替代。",
    defaultHint: "（占位）",
  },
  // -------------------- Dev / Data --------------------
  {
    id: "github",
    name: "GitHub",
    blurb: "管 issue / pull request / 仓库元数据",
    icon: "GH",
    color: "#6e7681",
    tokenUrl:
      "https://github.com/settings/tokens/new?description=SQLad&scopes=repo,read:user,read:org",
    scheme: "bearer",
    category: "dev",
    capabilities: [
      "把 issues 同步到表",
      "查我的仓库 / star 数 / 贡献统计",
      "新增 issue 自动建表记录",
    ],
    howTo: [
      "1. 点上面的「打开 GitHub Token 页面」（会自动选好需要的权限）",
      "2. 滚到底部，点 **Generate token**",
      "3. 复制生成的 token（只显示一次！）",
      "4. 粘贴到下方「Token」框",
      "5. 保存",
    ].join("\n"),
    aiSeed:
      "我刚连上 GitHub。先用 fetch_url credential='github' 调 https://api.github.com/user 验证一下，然后把我自己的 repo 列表（最多 100 个）同步到表 gh_repos（不存在就 create_table）",
    defaultHint: "GitHub PAT (repo + read:user)",
    aiHints: [
      {
        label: "同步我的 issues",
        prompt:
          "fetch_url credential='github' GET https://api.github.com/issues?per_page=100，写入表 gh_issues。",
      },
      {
        label: "发评论到 issue",
        prompt:
          "向用户要 owner/repo 和 issue 编号，fetch_url credential='github' POST https://api.github.com/repos/<o>/<r>/issues/<n>/comments，body={body:'…'}。",
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    blurb: "调 GPT 模型 / Embedding / DALL·E",
    icon: "AI",
    color: "#10a37f",
    tokenUrl: "https://platform.openai.com/api-keys",
    scheme: "bearer",
    category: "ai",
    capabilities: [
      "调外部 GPT 加工数据",
      "做向量",
      "AI 之间互调",
    ],
    howTo: [
      "1. 点上面打开 OpenAI API keys 页面",
      "2. 登录后点 **Create new secret key**",
      "3. 复制 sk-… 开头的 key（只显示一次）",
      "4. 粘贴到「Token」框 → 保存",
    ].join("\n"),
    aiSeed:
      "我刚连上 OpenAI。用 fetch_url credential='openai' POST https://api.openai.com/v1/chat/completions 跑一句 ping，确认能通。",
    defaultHint: "OpenAI API key",
    aiHints: [
      {
        label: "调 GPT 总结一段文本",
        prompt:
          "fetch_url credential='openai' POST https://api.openai.com/v1/chat/completions，body={model:'gpt-4o-mini', messages:[{role:'user', content:'…'}]}，从 choices[0].message.content 取回答。",
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    blurb: "调 Claude 系列模型",
    icon: "AC",
    color: "#cc785c",
    tokenUrl: "https://console.anthropic.com/settings/keys",
    scheme: "header:x-api-key",
    category: "ai",
    capabilities: ["调 Claude API 做总结 / 摘要", "把 Claude 接进自动化"],
    howTo: [
      "1. 打开 Anthropic Console keys 页面",
      "2. 登录后点 **Create Key**",
      "3. 复制 sk-ant-… 开头的 key",
      "4. 粘贴 → 保存",
    ].join("\n"),
    aiSeed:
      "我刚连上 Anthropic。用 fetch_url credential='anthropic' POST https://api.anthropic.com/v1/messages 跑一句 ping 验证。注意 anthropic-version 头要 '2023-06-01'。",
    defaultHint: "Anthropic API key",
    aiHints: [
      {
        label: "调 Claude 总结",
        prompt:
          "fetch_url credential='anthropic' POST https://api.anthropic.com/v1/messages，headers={'anthropic-version':'2023-06-01'}，body={model:'claude-sonnet-4-6', max_tokens:512, messages:[{role:'user', content:'…'}]}",
      },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    blurb: "读 / 写 Notion 数据库",
    icon: "N",
    color: "#191919",
    tokenUrl: "https://www.notion.so/my-integrations",
    scheme: "bearer",
    category: "productivity",
    capabilities: [
      "把 Notion database 同步到 SQLad 表",
      "新行回写到 Notion",
    ],
    howTo: [
      "1. 打开 Notion Integrations 页面",
      "2. 点 **New integration**，起个名（比如 SQLad），选你的 workspace",
      "3. Capabilities 至少勾上 **Read content**（要写就再勾 Update / Insert）",
      "4. 提交后复制 **Internal Integration Secret**",
      "5. 在 Notion 里打开你要用的 database/page → Share → 添加上这个 integration",
      "6. 把 token 粘贴 → 保存",
    ].join("\n"),
    aiSeed:
      "我刚连上 Notion。先用 fetch_url credential='notion' POST https://api.notion.com/v1/search （headers 加 Notion-Version: 2022-06-28）列出我授权的资源。",
    defaultHint: "Notion Internal Integration Secret",
    aiHints: [
      {
        label: "拉某个 database",
        prompt:
          "fetch_url credential='notion' POST https://api.notion.com/v1/databases/<db_id>/query，headers={'Notion-Version':'2022-06-28'}，把 results 拍平到 SQLad 表。",
      },
    ],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    blurb: "调推理 API / 数据集",
    icon: "🤗",
    color: "#ffb800",
    tokenUrl: "https://huggingface.co/settings/tokens",
    scheme: "bearer",
    category: "ai",
    capabilities: ["调 HF Inference Endpoints", "拉公开数据集元数据"],
    howTo: [
      "1. 打开 HF token 页面",
      "2. **New token** → Type 选 `Read`",
      "3. 复制 hf_… 开头的 token",
      "4. 粘贴 → 保存",
    ].join("\n"),
    aiSeed:
      "我刚连上 Hugging Face。用 fetch_url credential='huggingface' GET https://huggingface.co/api/whoami-v2 验证。",
    defaultHint: "Hugging Face read token",
  },
];

export const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  messaging: "通讯",
  dev: "开发协作",
  ai: "AI 模型",
  data: "数据源",
  productivity: "生产力",
  other: "其他",
};

export function findService(
  id: string,
  catalog: ServiceCatalogEntry[]
): ServiceCatalogEntry | undefined {
  return catalog.find((s) => s.id === id);
}
