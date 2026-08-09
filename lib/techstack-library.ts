/**
 * 技术栈库:每个技术栈「能干什么」+ 标签,AI 根据标签与用户需求的匹配度选择课程技术栈。
 * 纯数据文件,无服务端依赖,客户端可安全导入。
 */

export interface TechStackEntry {
  id: string;
  name: string;
  /** 主要语言/工具名 */
  languages: string[];
  /** 领域/属性标签(统一词汇,用于匹配) */
  tags: string[];
  /** 能干什么(面向学习者的一句话) */
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  /** 该栈的典型「用 X 做 Y」课程主线,从小到大 */
  typicalProjects: string[];
  /** 支持平台 */
  environment: ("linux" | "macos" | "windows")[];
  /** 同等匹配度下的默认优先级(越高越优先) */
  priority: number;
  /** 前置基础(无则省略) */
  prerequisites?: string[];
}

export const TECHSTACK_LIBRARY: TechStackEntry[] = [
  /* ---------- 爬虫 / 数据采集 ---------- */
  {
    id: "python-requests",
    name: "Python + requests + BeautifulSoup",
    languages: ["Python"],
    tags: ["爬虫", "数据采集", "入门友好", "脚本", "教学资料丰富"],
    description: "抓取网页数据并解析,是爬虫领域最主流的入门组合,零基础也能快速跑通",
    difficulty: "beginner",
    typicalProjects: [
      "用 Python 抓取豆瓣电影 Top250 榜单",
      "用 Python 爬取天气数据并生成日报",
      "用 Python 定时抓取新闻摘要存成文件",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 95,
  },
  {
    id: "python-scrapy",
    name: "Python + Scrapy",
    languages: ["Python"],
    tags: ["爬虫", "数据采集", "生产级", "需编程基础"],
    description: "企业级爬虫框架,适合大规模、结构化的采集任务,自带调度与去重",
    difficulty: "intermediate",
    typicalProjects: [
      "用 Scrapy 搭建电商商品采集器",
      "用 Scrapy 批量抓取招聘网站职位数据",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 70,
    prerequisites: ["Python 基础"],
  },
  {
    id: "node-cheerio",
    name: "Node.js + axios + cheerio",
    languages: ["JavaScript"],
    tags: ["爬虫", "数据采集", "需编程基础"],
    description: "用 JavaScript 抓取与解析网页,适合已会 JS 的用户,与前端技能无缝衔接",
    difficulty: "intermediate",
    typicalProjects: [
      "用 Node.js 抓取 GitHub 热门仓库列表",
      "用 Node.js 定时抓取赛事比分并推送提醒",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 70,
    prerequisites: ["JavaScript 基础"],
  },

  /* ---------- Web 前端 ---------- */
  {
    id: "html-css",
    name: "HTML + CSS",
    languages: ["HTML/CSS"],
    tags: ["Web前端", "入门友好", "零配置", "教学资料丰富"],
    description: "搭建与美化网页页面,零基础首选,打开浏览器就能看到成果",
    difficulty: "beginner",
    typicalProjects: [
      "用 HTML 和 CSS 做一张咖啡菜单页",
      "用 HTML 和 CSS 做个人作品集主页",
      "用 HTML 和 CSS 仿制一个落地页",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 95,
  },
  {
    id: "html-css-js",
    name: "HTML + CSS + JavaScript",
    languages: ["JavaScript", "HTML/CSS"],
    tags: ["Web前端", "入门友好", "教学资料丰富"],
    description: "做有交互的网页:点击、表单、动画、数据渲染,前端入门完整路径",
    difficulty: "beginner",
    typicalProjects: [
      "用 JavaScript 做一个待办清单网页",
      "用 JavaScript 做一个猜数字小游戏网页",
      "用 JavaScript 做一个记账本网页",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 95,
  },
  {
    id: "react",
    name: "React",
    languages: ["JavaScript", "TypeScript"],
    tags: ["Web前端", "需编程基础", "生产级", "教学资料丰富"],
    description: "组件化构建现代单页应用,前端主流框架,就业面广",
    difficulty: "intermediate",
    typicalProjects: [
      "用 React 做一个商品卡片商城页",
      "用 React 做一个可搜索的菜谱应用",
      "用 React 做一个个人博客前台",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 85,
    prerequisites: ["HTML/CSS/JS 基础"],
  },
  {
    id: "vue",
    name: "Vue 3",
    languages: ["JavaScript", "TypeScript"],
    tags: ["Web前端", "需编程基础", "入门友好"],
    description: "渐进式前端框架,上手比 React 平缓,中文资料丰富",
    difficulty: "intermediate",
    typicalProjects: [
      "用 Vue 做一个购物清单应用",
      "用 Vue 做一个电影搜索应用",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 75,
    prerequisites: ["HTML/CSS/JS 基础"],
  },

  /* ---------- Web 后端 ---------- */
  {
    id: "python-flask",
    name: "Python + Flask",
    languages: ["Python"],
    tags: ["Web后端", "入门友好", "教学资料丰富"],
    description: "轻量级 Python Web 框架,写 API 和网站后台,入门后端的最短路径",
    difficulty: "beginner",
    typicalProjects: [
      "用 Flask 做一个待办事项 API",
      "用 Flask 做一个日记网站",
      "用 Flask 做一个博客后台",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 90,
    prerequisites: ["Python 基础"],
  },
  {
    id: "python-fastapi",
    name: "Python + FastAPI",
    languages: ["Python"],
    tags: ["Web后端", "生产级", "需编程基础", "现代技术"],
    description: "现代高性能 Python API 框架,自动生成接口文档,适合工具类产品后端",
    difficulty: "intermediate",
    typicalProjects: [
      "用 FastAPI 做一个翻译 API",
      "用 FastAPI 做一个文件上传管理服务",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 80,
    prerequisites: ["Python 基础"],
  },
  {
    id: "node-express",
    name: "Node.js + Express",
    languages: ["JavaScript"],
    tags: ["Web后端", "需编程基础", "教学资料丰富"],
    description: "JavaScript 后端框架,前后端同语言,适合会 JS 的用户",
    difficulty: "intermediate",
    typicalProjects: [
      "用 Express 做一个任务管理 API",
      "用 Express 做一个留言板后端",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 80,
    prerequisites: ["JavaScript 基础"],
  },
  {
    id: "go-server",
    name: "Go + net/http",
    languages: ["Go"],
    tags: ["Web后端", "高性能", "需编程基础", "现代技术"],
    description: "编译型高性能后端语言,单文件部署,适合追求性能与简洁的用户",
    difficulty: "intermediate",
    typicalProjects: [
      "用 Go 做一个短链接服务",
      "用 Go 做一个文件服务器",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 70,
    prerequisites: ["编程基础"],
  },
  {
    id: "java-spring",
    name: "Java + Spring Boot",
    languages: ["Java"],
    tags: ["Web后端", "生产级", "需编程基础", "企业级"],
    description: "企业级后端主流框架,大厂岗位需求大,学习曲线陡但回报高",
    difficulty: "advanced",
    typicalProjects: [
      "用 Spring Boot 做一个员工管理系统",
      "用 Spring Boot 做一个简易电商后端",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 75,
    prerequisites: ["Java 基础"],
  },

  /* ---------- 全栈 ---------- */
  {
    id: "nextjs",
    name: "Next.js",
    languages: ["JavaScript", "TypeScript"],
    tags: ["全栈", "需编程基础", "生产级", "现代技术"],
    description: "React 全栈框架,前后端一体化,一个框架做出完整应用",
    difficulty: "intermediate",
    typicalProjects: [
      "用 Next.js 做一个笔记应用",
      "用 Next.js 做一个博客站(含后台)",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 85,
    prerequisites: ["React/JS 基础"],
  },
  {
    id: "flask-sqlite",
    name: "Flask + SQLite + Jinja2",
    languages: ["Python", "SQL"],
    tags: ["全栈", "入门友好", "教学资料丰富"],
    description: "轻量全栈:数据库 + 后端 + 模板渲染,一次学完一个完整网站",
    difficulty: "beginner",
    typicalProjects: [
      "用 Flask 做一个记账本网站",
      "用 Flask 做一个待办事项网站",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 85,
    prerequisites: ["Python 基础"],
  },

  /* ---------- 数据分析 / 可视化 ---------- */
  {
    id: "python-pandas",
    name: "Python + pandas",
    languages: ["Python"],
    tags: ["数据分析", "入门友好", "教学资料丰富", "脚本"],
    description: "表格数据处理与分析:清洗、统计、筛选,数据分析领域的核心技能",
    difficulty: "beginner",
    typicalProjects: [
      "用 pandas 分析电影评分数据",
      "用 pandas 统计销售报表并产出结论",
      "用 pandas 分析班级成绩分布",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 90,
    prerequisites: ["Python 基础"],
  },
  {
    id: "python-viz",
    name: "Python + matplotlib + seaborn",
    languages: ["Python"],
    tags: ["数据可视化", "入门友好", "教学资料丰富"],
    description: "把数据画成图表:折线、柱状、热力图,让数据说话",
    difficulty: "beginner",
    typicalProjects: [
      "用 matplotlib 绘制房价趋势图",
      "用 seaborn 做一份完整的数据可视化报告",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 80,
    prerequisites: ["Python 基础"],
  },
  {
    id: "sql",
    name: "SQL(SQLite)",
    languages: ["SQL"],
    tags: ["数据库", "入门友好", "教学资料丰富"],
    description: "数据库查询语言:建表、增删改查、多表联查,几乎所有岗位都要会",
    difficulty: "beginner",
    typicalProjects: [
      "用 SQL 建一个图书馆数据库",
      "用 SQL 分析电商订单数据",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 90,
  },

  /* ---------- 自动化 / 脚本 ---------- */
  {
    id: "python-script",
    name: "Python 脚本自动化",
    languages: ["Python"],
    tags: ["自动化", "脚本", "入门友好", "零配置"],
    description: "用 Python 写脚本处理重复工作:批量改文件、整理数据、定时任务",
    difficulty: "beginner",
    typicalProjects: [
      "用 Python 批量重命名文件",
      "用 Python 自动整理下载文件夹",
      "用 Python 定时备份配置文件",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 90,
  },
  {
    id: "pyautogui",
    name: "Python + pyautogui 桌面自动化",
    languages: ["Python"],
    tags: ["自动化", "脚本", "需编程基础", "桌面应用"],
    description: "模拟鼠标键盘操作,自动操作桌面软件,办公自动化利器",
    difficulty: "intermediate",
    typicalProjects: [
      "用 pyautogui 自动填写表单",
      "用 Python 做桌面点击脚本自动化",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 70,
    prerequisites: ["Python 基础"],
  },
  {
    id: "shell",
    name: "Bash / Shell 脚本",
    languages: ["Shell"],
    tags: ["命令行", "自动化", "脚本", "入门友好", "零配置"],
    description: "用命令行脚本高效管理系统与文件,程序员效率基石",
    difficulty: "beginner",
    typicalProjects: [
      "用 Shell 写一个文件备份脚本",
      "用 Shell 批量处理日志文件",
      "用 Shell 做一个系统健康检查脚本",
    ],
    environment: ["linux", "macos"],
    priority: 90,
  },

  /* ---------- 命令行 / 工具类 ---------- */
  {
    id: "git",
    name: "Git",
    languages: ["Shell"],
    tags: ["命令行", "DevOps", "入门友好", "教学资料丰富", "零配置"],
    description: "版本控制:提交、分支、协作,写代码的人必备技能",
    difficulty: "beginner",
    typicalProjects: [
      "用 Git 管理个人项目并发布到 GitHub",
      "用 Git 模拟多人协作开发流程",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 95,
  },
  {
    id: "docker",
    name: "Docker",
    languages: ["Shell", "YAML"],
    tags: ["DevOps", "需编程基础", "生产级"],
    description: "容器化部署:打包应用与依赖,一键运行,现代开发必会工具",
    difficulty: "intermediate",
    typicalProjects: [
      "用 Docker 部署一个 Web 应用",
      "用 Docker Compose 搭一个前后端环境",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 85,
  },
  {
    id: "linux-cli",
    name: "Linux 命令行",
    languages: ["Shell"],
    tags: ["命令行", "入门友好", "零配置", "教学资料丰富"],
    description: "文件操作、进程管理、权限、管道与重定向,系统入门必修",
    difficulty: "beginner",
    typicalProjects: [
      "用命令行搭建一个个人文件管理系统",
      "用 Linux 命令分析日志定位问题",
    ],
    environment: ["linux", "macos"],
    priority: 90,
  },

  /* ---------- AI 应用 ---------- */
  {
    id: "python-ai-api",
    name: "Python + OpenAI API",
    languages: ["Python"],
    tags: ["AI应用", "需编程基础", "现代技术"],
    description: "调用大模型 API 构建 AI 应用:对话、总结、翻译、智能助手",
    difficulty: "intermediate",
    typicalProjects: [
      "用 OpenAI API 做一个智能问答助手",
      "用 Python 做一个文章摘要工具",
      "用 API 做一个翻译小助手",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 90,
    prerequisites: ["Python 基础"],
  },
  {
    id: "python-ml",
    name: "Python + scikit-learn",
    languages: ["Python"],
    tags: ["机器学习", "需编程基础", "教学资料丰富"],
    description: "经典机器学习入门:分类、回归、聚类,理解 AI 背后的原理",
    difficulty: "intermediate",
    typicalProjects: [
      "用 scikit-learn 做鸢尾花分类器",
      "用 Python 预测房价",
      "用 Python 做垃圾邮件分类器",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 80,
    prerequisites: ["Python 基础", "数学基础(中学水平)"],
  },

  /* ---------- 游戏 ---------- */
  {
    id: "python-pygame",
    name: "Python + Pygame",
    languages: ["Python"],
    tags: ["游戏开发", "入门友好", "教学资料丰富", "趣味性强"],
    description: "用 Python 做 2D 小游戏:碰撞、动画、音效,趣味驱动学习",
    difficulty: "beginner",
    typicalProjects: [
      "用 Pygame 做贪吃蛇",
      "用 Pygame 做打砖块游戏",
      "用 Pygame 做一个太空射击游戏",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 85,
    prerequisites: ["Python 基础"],
  },
  {
    id: "js-canvas",
    name: "JavaScript + Canvas",
    languages: ["JavaScript"],
    tags: ["游戏开发", "Web前端", "需编程基础", "趣味性强"],
    description: "在网页上做 2D 游戏与动画,浏览器直接运行,分享方便",
    difficulty: "intermediate",
    typicalProjects: [
      "用 Canvas 做弹球游戏",
      "用 Canvas 做一个平台跳跃小游戏",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 75,
    prerequisites: ["JavaScript 基础"],
  },

  /* ---------- 桌面应用 ---------- */
  {
    id: "python-tkinter",
    name: "Python + Tkinter",
    languages: ["Python"],
    tags: ["桌面应用", "入门友好", "零配置"],
    description: "Python 自带 GUI 库,做出可双击运行的桌面小工具",
    difficulty: "beginner",
    typicalProjects: [
      "用 Tkinter 做一个计算器",
      "用 Tkinter 做一个待办清单桌面工具",
      "用 Tkinter 做一个记事本",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 80,
    prerequisites: ["Python 基础"],
  },
  {
    id: "electron",
    name: "Electron",
    languages: ["JavaScript", "TypeScript"],
    tags: ["桌面应用", "生产级", "需编程基础"],
    description: "用 Web 技术做跨平台桌面应用,生态成熟(VS Code 同款技术)",
    difficulty: "intermediate",
    typicalProjects: [
      "用 Electron 做一个便签桌面应用",
      "用 Electron 做一个 Markdown 编辑器",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 75,
    prerequisites: ["HTML/CSS/JS 基础"],
  },

  /* ---------- 算法 ---------- */
  {
    id: "python-algo",
    name: "Python 算法与数据结构",
    languages: ["Python"],
    tags: ["算法", "需编程基础", "教学资料丰富"],
    description: "数据结构与经典算法:排序、搜索、递归、动态规划,面试与竞赛基础",
    difficulty: "intermediate",
    typicalProjects: [
      "用 Python 实现常用排序算法库",
      "用 Python 做一个迷宫求解器",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 80,
    prerequisites: ["Python 基础"],
  },
  {
    id: "js-algo",
    name: "JavaScript 算法与数据结构",
    languages: ["JavaScript"],
    tags: ["算法", "需编程基础", "教学资料丰富"],
    description: "用 JavaScript 学数据结构和算法,前端工程师面试必备",
    difficulty: "intermediate",
    typicalProjects: [
      "用 JS 实现一个 LRU 缓存",
      "用 JS 做一个可视化排序演示页",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 75,
    prerequisites: ["JavaScript 基础"],
  },
];

/** 按 id 查技术栈 */
export function getTechStack(id: string): TechStackEntry | undefined {
  return TECHSTACK_LIBRARY.find((s) => s.id === id);
}

/** 精简目录:供 AI 快速浏览选栈(名称+标签+一句话),避免全量数据撑爆上下文 */
export function techStackCatalog(): string {
  return TECHSTACK_LIBRARY.map(
    (s) => `${s.id} | ${s.name} | 标签:${s.tags.join(",")} | 难度:${s.difficulty} | ${s.description}`
  ).join("\n");
}
