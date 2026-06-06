import type { Trigger } from "../api/types";

export interface AutomationTemplate {
  id: string;
  name: string;
  /** Sentence-case description, ~1 line. */
  blurb: string;
  category: "external" | "watch" | "schedule" | "ai";
  icon: string;
  /** Builds a Trigger from user-filled fields. */
  build: (fields: Record<string, string>) => Omit<Trigger, "id">;
  /** Form fields the user fills. */
  fields: Array<{
    key: string;
    label: string;
    helper?: string;
    placeholder?: string;
    type?: "text" | "textarea" | "number";
    default?: string;
  }>;
}

export const TEMPLATES: AutomationTemplate[] = [
  {
    id: "fetch-api-to-table",
    name: "从 API 拉数据到表",
    blurb: "定时调一个 HTTP 接口，把返回的列表写到一张表里",
    category: "external",
    icon: "🌐",
    fields: [
      {
        key: "url",
        label: "API 地址",
        placeholder: "https://api.github.com/repos/anthropics/anthropic-cookbook/issues",
        helper: "完整 URL，会以 GET 请求拉取",
      },
      {
        key: "credential",
        label: "用哪个连接（可选）",
        placeholder: "github",
        helper: "如果接口要登录，填「设置 → 连接」里的名字",
      },
      {
        key: "table",
        label: "存进哪张表",
        placeholder: "gh_issues",
        helper: "不存在的话 AI 会自动建一张",
      },
      {
        key: "interval_min",
        label: "多久跑一次（分钟）",
        type: "number",
        default: "60",
      },
    ],
    build: (f) => ({
      name: `${f.table} ← ${f.url.slice(0, 40)}`,
      enabled: true,
      interval_secs: Math.max(60, Number(f.interval_min || 60) * 60),
      condition_sql: "SELECT 1",
      action_prompt:
        `用 fetch_url GET ${f.url}` +
        (f.credential ? ` credential='${f.credential}'` : "") +
        `\n把返回的对象数组拍平存到表 ${f.table}。如果表不存在，先用 create_table 建好（合理的列名/类型）。已有的行如果能根据某个 id/key 去重就跳过，否则就追加。最后用一句话告诉用户拿了多少条新数据。`,
    }),
  },
  {
    id: "threshold-watch",
    name: "字段超阈值就提醒",
    blurb: "盯着某张表的某一列，超过 / 小于阈值时让 AI 做点什么",
    category: "watch",
    icon: "🚨",
    fields: [
      { key: "table", label: "看哪张表", placeholder: "sales" },
      { key: "column", label: "看哪一列", placeholder: "revenue" },
      {
        key: "operator",
        label: "比较符",
        default: ">",
        helper: ">、<、>=、<=、=、!=",
      },
      { key: "threshold", label: "阈值", placeholder: "1000" },
      {
        key: "what_to_do",
        label: "命中时让 AI 做什么",
        type: "textarea",
        placeholder:
          "示例：在表 alerts 里加一行（time / table / row_id / column / value / note）；note 字段写一句简短的解释。",
      },
      {
        key: "interval_min",
        label: "多久检查一次（分钟）",
        type: "number",
        default: "5",
      },
    ],
    build: (f) => ({
      name: `${f.table}.${f.column} ${f.operator} ${f.threshold}`,
      enabled: true,
      interval_secs: Math.max(60, Number(f.interval_min || 5) * 60),
      condition_sql: `SELECT * FROM "${f.table}" WHERE "${f.column}" ${f.operator || ">"} ${f.threshold}`,
      action_prompt: f.what_to_do,
    }),
  },
  {
    id: "new-row-react",
    name: "新数据出现就反应",
    blurb: "表里新增了符合条件的行，触发 AI 的某个动作",
    category: "watch",
    icon: "📥",
    fields: [
      { key: "table", label: "看哪张表", placeholder: "feedback" },
      {
        key: "where",
        label: "什么样的新行算命中（WHERE 条件，可空）",
        placeholder: "rating <= 2",
        helper: "用 SQL 条件描述。空的话每次跑都命中所有行。",
      },
      {
        key: "what_to_do",
        label: "命中时做什么",
        type: "textarea",
        placeholder: "示例：把 matched_rows 的 user_id 和 comment 字段汇总一句话。",
      },
      {
        key: "interval_min",
        label: "多久检查一次（分钟）",
        type: "number",
        default: "10",
      },
    ],
    build: (f) => ({
      name: `${f.table}: ${f.where || "any new row"}`,
      enabled: true,
      interval_secs: Math.max(60, Number(f.interval_min || 10) * 60),
      condition_sql: `SELECT * FROM "${f.table}"${f.where ? ` WHERE ${f.where}` : ""} ORDER BY _id DESC LIMIT 50`,
      action_prompt: f.what_to_do,
    }),
  },
  {
    id: "daily-summary",
    name: "每天定时小结",
    blurb: "每天某个时间，让 AI 给一张表写一份当日小结",
    category: "schedule",
    icon: "📅",
    fields: [
      { key: "table", label: "对哪张表做小结", placeholder: "orders" },
      {
        key: "what_to_do",
        label: "小结内容",
        type: "textarea",
        placeholder:
          "示例：统计今天的订单数、总额、最大单笔；把结果存到表 daily_summary。",
        default:
          "统计今天的新增行数与关键聚合（sum/avg），存到表 daily_summary（不存在就建：date/table/rows/sum/avg/note）",
      },
    ],
    build: (f) => ({
      name: `每日小结 · ${f.table}`,
      enabled: true,
      interval_secs: 24 * 60 * 60,
      condition_sql: `SELECT date('now') AS today, COUNT(*) AS rows FROM "${f.table}"`,
      action_prompt: f.what_to_do,
    }),
  },
  {
    id: "notify-on-threshold",
    name: "超标了通知我（通讯）",
    blurb: "监控某列超阈值就发 Slack / Telegram / 钉钉 / 飞书 / 企业微信消息",
    category: "watch",
    icon: "🔔",
    fields: [
      { key: "table", label: "看哪张表", placeholder: "orders" },
      { key: "column", label: "看哪一列", placeholder: "amount" },
      { key: "operator", label: "比较符", default: ">" },
      { key: "threshold", label: "阈值", placeholder: "10000" },
      {
        key: "credential",
        label: "发到哪（连接名）",
        placeholder: "slack 或 feishu 或 dingtalk",
        helper: "需先在「设置 → 连接」里连好通讯服务",
      },
      {
        key: "webhook_url",
        label: "Webhook URL（飞书 / 钉钉 / 企微 需要；Slack 不填）",
        placeholder: "如果是 Slack 留空，它会用 chat.postMessage",
        helper: "可空",
      },
      {
        key: "message",
        label: "消息内容（用大白话，AI 会填具体值）",
        type: "textarea",
        placeholder:
          "示例：⚠️ {{table}} 表里 {{column}} 超标了，最新值 = xxx，帮我把数据写成一行发过去。",
      },
      {
        key: "interval_min",
        label: "多久检查一次（分钟）",
        type: "number",
        default: "10",
      },
    ],
    build: (f) => ({
      name: `通知：${f.table}.${f.column} ${f.operator} ${f.threshold}`,
      enabled: true,
      interval_secs: Math.max(60, Number(f.interval_min || 10) * 60),
      condition_sql: `SELECT * FROM "${f.table}" WHERE "${f.column}" ${f.operator || ">"} ${f.threshold}`,
      action_prompt:
        `matched_rows 命中超标条件。把每一行的关键字段摘要出来，然后${f.webhook_url ? "用 fetch_url POST " + f.webhook_url + " 把内容推过去（格式参考对应服务的 bot 消息体）" : f.credential ? "用 fetch_url credential='" + f.credential + "' POST 对应的消息 API 发到配置的频道里" : "告诉我没有通讯渠道可发"}。\n\n消息大意：${f.message || "{{table}} 表超标通知"}`,
    }),
  },
  {
    id: "new-row-notify",
    name: "有新数据就发消息（通讯）",
    blurb: "表里有了符合条件的新行，自动发通知",
    category: "watch",
    icon: "📨",
    fields: [
      { key: "table", label: "看哪张表", placeholder: "feedback" },
      {
        key: "where",
        label: "什么新行算命中（WHERE，可空）",
        placeholder: "rating <= 2",
      },
      {
        key: "credential",
        label: "发到哪（连接名）",
        placeholder: "slack 或 discord 或 dingtalk",
      },
      {
        key: "webhook_url",
        label: "Webhook URL（飞书 / 钉钉 / 企微 / 通用 需要）",
        placeholder: "可空",
      },
      {
        key: "interval_min",
        label: "多久检查一次（分钟）",
        type: "number",
        default: "5",
      },
    ],
    build: (f) => ({
      name: `新行通知 · ${f.table}`,
      enabled: true,
      interval_secs: Math.max(60, Number(f.interval_min || 5) * 60),
      condition_sql: `SELECT * FROM "${f.table}"${f.where ? ` WHERE ${f.where}` : ""} ORDER BY _id DESC LIMIT 20`,
      action_prompt:
        `每次运行，matched_rows 是最近命中条件的新行。逐行总结要点，然后用${f.webhook_url ? "fetch_url POST " + f.webhook_url + " 推送" : f.credential ? "fetch_url credential='" + f.credential + "' POST 对应的消息 API 推送" : "告诉我"}"。只发一条消息，不要逐个发多条。如果 matched_rows 和上次一样或者空了，不发。`,
    }),
  },
  {
    id: "scheduled-report",
    name: "定时发报告（通讯）",
    blurb: "每天/每周在指定时间，从表里拉汇总数据发到群/邮件",
    category: "schedule",
    icon: "📊",
    fields: [
      { key: "table", label: "对哪张表做报告", placeholder: "orders" },
      {
        key: "credential",
        label: "发到哪（连接名）",
        placeholder: "slack 或 resend",
      },
      {
        key: "webhook_url",
        label: "Webhook URL（如果不需要连接）",
        placeholder: "可空",
      },
      {
        key: "summary_instruction",
        label: "报告内容（大白话描述）",
        type: "textarea",
        placeholder:
          "示例：今天新增多少单、总金额、最多的品类是啥、有没有异常大单。用简洁的 markdown 列表格式。",
      },
    ],
    build: (f) => ({
      name: `定时报告 · ${f.table}`,
      enabled: true,
      interval_secs: 24 * 60 * 60,
      condition_sql: `SELECT date('now') AS today, (SELECT COUNT(*) FROM "${f.table}") AS total_rows`,
      action_prompt:
        `这是定时报告。从表 "${f.table}" 按今天的标准做一份汇总。\n${f.summary_instruction}\n\n做完后用${f.webhook_url ? "fetch_url POST " + f.webhook_url + " 推送" : f.credential ? "fetch_url credential='" + f.credential + "' 发到对应平台" : "告诉用户说要给哪个 webhook"}。`,
    }),
  },
  {
    id: "ai-llm-call",
    name: "调外部大模型加工数据",
    blurb: "命中行喂给外部 LLM（OpenAI / Anthropic），把结果写回表",
    category: "ai",
    icon: "🧠",
    fields: [
      { key: "table", label: "源表", placeholder: "feedback" },
      {
        key: "where",
        label: "选哪些行（WHERE，可空）",
        placeholder: "summary IS NULL",
      },
      {
        key: "credential",
        label: "用哪个 LLM 连接",
        placeholder: "openai 或 anthropic",
        helper: "在「设置 → 连接」里建好",
      },
      {
        key: "prompt",
        label: "对每行说什么",
        type: "textarea",
        placeholder:
          "示例：给我用 30 字内总结这条反馈的诉求；只回答总结本身。",
      },
      {
        key: "write_to",
        label: "结果写到哪一列",
        placeholder: "summary",
      },
      {
        key: "interval_min",
        label: "多久跑一次（分钟）",
        type: "number",
        default: "30",
      },
    ],
    build: (f) => ({
      name: `LLM 加工 ${f.table}.${f.write_to}`,
      enabled: true,
      interval_secs: Math.max(60, Number(f.interval_min || 30) * 60),
      condition_sql: `SELECT * FROM "${f.table}"${f.where ? ` WHERE ${f.where}` : ""} LIMIT 20`,
      action_prompt:
        `对 matched_rows 里每一行，用 fetch_url credential='${f.credential}' 调用对应 LLM API 把这条提示词跑一遍：\n\n${f.prompt}\n\n` +
        `把回答写到 "${f.table}" 表的 "${f.write_to}" 列（用 update via insert/replace 都行；记得带 _id 定位）。`,
    }),
  },
];
