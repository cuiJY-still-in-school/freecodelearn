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

  /* ---------- 扩充:前端/后端/全栈/数据/自动化/CLI/AI/游戏/桌面/移动端 ---------- */
  {
    id: "go-colly",
    name: "Go + Colly",
    languages: ["Go"],
    tags: ["爬虫", "数据采集", "后端", "高性能", "跨平台", "需编程基础", "性能要求高"],
    description:
      "用 Go 的 Colly 框架编写高并发爬虫,单机可轻松跑出上千并发请求,适合构建对速度和资源占用敏感的采集服务。",
    difficulty: "intermediate",
    typicalProjects: [
      "抓取单页电商商品列表并导出 CSV",
      "编写并发新闻聚合爬虫,定时抓取多个站点并去重入库",
      "搭建分布式抓取任务队列,配合 Redis 做 URL 去重和限速调度",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 55,
    prerequisites: ["Go 语言基础", "HTTP 协议基础"],
  },
  {
    id: "python-httpx-parsel",
    name: "Python + httpx + parsel (异步爬虫)",
    languages: ["Python"],
    tags: ["爬虫", "数据采集", "入门友好", "教学资料丰富", "跨平台", "需编程基础"],
    description:
      "用 httpx 的异步请求能力和 parsel 的 XPath/CSS 选择器,编写比同步 requests 更快的批量采集脚本,适合中大规模页面抓取。",
    difficulty: "intermediate",
    typicalProjects: [
      "异步抓取豆瓣图书信息并存入 SQLite",
      "批量抓取招聘网站职位信息并做薪资统计",
      "实现带并发限流和失败重试的通用异步采集框架",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 60,
    prerequisites: ["Python 基础", "了解 async/await"],
  },
  {
    id: "java-jsoup",
    name: "Java + Jsoup + HttpClient",
    languages: ["Java"],
    tags: ["爬虫", "数据采集", "企业级", "就业导向", "跨平台", "需编程基础"],
    description:
      "用 Jsoup 解析 HTML、HttpClient 发起请求,在 Java 企业技术栈内完成数据采集,适合已有 Java 背景、要把爬虫整合进现有系统的学习者。",
    difficulty: "intermediate",
    typicalProjects: [
      "抓取论坛帖子列表并解析成 Java 对象",
      "定时抓取股票行情页面写入 MySQL",
      "将采集模块封装成 Spring Boot 后台任务并暴露 REST 接口查询",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 40,
    prerequisites: ["Java 基础", "面向对象编程"],
  },
  {
    id: "svelte-sveltekit",
    name: "Svelte + SvelteKit",
    languages: ["JavaScript", "TypeScript"],
    tags: ["前端", "入门友好", "性能要求高", "教学资料丰富", "跨平台"],
    description:
      "用编译时框架 Svelte 写更少的样板代码,配合 SvelteKit 完成路由、SSR 和打包,做出加载快、体积小的现代网站。",
    difficulty: "beginner",
    typicalProjects: [
      "制作个人博客/作品集网站",
      "开发带路由和状态管理的待办事项应用",
      "搭建支持服务端渲染和 API 路由的小型电商前台",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 65,
  },
  {
    id: "angular",
    name: "Angular",
    languages: ["TypeScript"],
    tags: ["前端", "企业级", "就业导向", "生产级", "需编程基础", "跨平台"],
    description:
      "用 Google 维护的全家桶框架 Angular 构建大型企业级单页应用,内置依赖注入、表单校验和路由,适合面向中大型团队协作项目学习。",
    difficulty: "intermediate",
    typicalProjects: [
      "搭建带表单校验的用户注册登录页",
      "开发多模块的后台管理系统骨架",
      "实现懒加载路由和状态管理的企业级仪表盘",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 45,
    prerequisites: ["TypeScript 基础", "HTML/CSS 基础"],
  },
  {
    id: "alpinejs",
    name: "Alpine.js",
    languages: ["JavaScript"],
    tags: ["前端", "入门友好", "零配置", "轻量级", "趣味性强"],
    description:
      "在传统 HTML 页面里直接写声明式交互逻辑,不用构建工具、不用打包,几分钟就能给静态页面加上下拉菜单、标签页等动态效果。",
    difficulty: "beginner",
    typicalProjects: [
      "给静态落地页加上手风琴和标签页交互",
      "制作无需刷新的简单购物车小组件",
      "为服务端渲染的多页站点统一添加轻量交互层",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 50,
  },
  {
    id: "vite-ts-vanilla",
    name: "TypeScript + Vite (原生前端组件开发)",
    languages: ["TypeScript"],
    tags: ["前端", "入门友好", "性能要求高", "需编程基础", "跨平台"],
    description:
      "不依赖 React/Vue 等框架,用 TypeScript 加 Vite 的极速热更新,从零手写 DOM 操作和组件封装,理解框架背后的原理。",
    difficulty: "intermediate",
    typicalProjects: [
      "用原生 TS 实现一个可复用的模态框组件库",
      "手写简易虚拟 DOM 和响应式系统",
      "搭建零框架依赖的多页面官网并接入 Vite 构建",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 35,
    prerequisites: ["JavaScript 基础", "TypeScript 基础"],
  },
  {
    id: "node-nestjs",
    name: "Node.js + NestJS",
    languages: ["TypeScript"],
    tags: ["后端", "企业级", "生产级", "就业导向", "需编程基础", "跨平台"],
    description:
      "用带装饰器和模块化架构的 NestJS 构建结构清晰的 Node.js 后端服务,内置依赖注入和管道校验,写法接近 Spring/Angular,适合往企业级 Node 后端方向发展。",
    difficulty: "intermediate",
    typicalProjects: [
      "搭建带 JWT 鉴权的用户管理 REST API",
      "开发带模块化架构的博客后端(文章/评论/标签)",
      "实现微服务间用消息队列通信的订单系统",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 50,
    prerequisites: ["TypeScript 基础", "了解 REST API"],
  },
  {
    id: "ruby-rails",
    name: "Ruby on Rails",
    languages: ["Ruby"],
    tags: ["后端", "全栈", "入门友好", "教学资料丰富", "生产级", "就业导向"],
    description:
      "用『约定优于配置』的 Rails 框架,几行代码生成模型、路由和视图脚手架,是公认最快能做出可用产品原型的后端框架之一。",
    difficulty: "beginner",
    typicalProjects: [
      "用脚手架命令生成一个博客系统的增删改查",
      "开发带用户认证的问答社区网站",
      "实现带支付和后台管理的小型电商应用",
    ],
    environment: ["linux", "macos"],
    priority: 55,
  },
  {
    id: "php-laravel",
    name: "PHP + Laravel",
    languages: ["PHP"],
    tags: ["后端", "全栈", "入门友好", "教学资料丰富", "生产级", "就业导向"],
    description:
      "用全球市场占有率最高的 PHP 框架之一 Laravel,搭配 Eloquent ORM 和 Blade 模板,快速搭建能实际上线的网站后端,中文教程和社区资料极其丰富。",
    difficulty: "beginner",
    typicalProjects: [
      "搭建带登录注册的个人博客系统",
      "开发带订单和库存管理的小型商城后台",
      "实现基于队列和定时任务的自动化通知系统",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 55,
  },
  {
    id: "dotnet-aspnet",
    name: ".NET + ASP.NET Core",
    languages: ["C#"],
    tags: ["后端", "企业级", "生产级", "就业导向", "性能要求高", "需编程基础"],
    description:
      "用微软官方的 ASP.NET Core 构建高性能、跨平台的企业级 Web API,是 .NET 生态和金融/传统企业软件岗位的主流选择。",
    difficulty: "intermediate",
    typicalProjects: [
      "搭建带 Entity Framework 的图书管理 REST API",
      "开发带角色权限控制的企业内部系统后端",
      "实现高并发库存扣减接口并做压力测试优化",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 45,
    prerequisites: ["C# 基础", "面向对象编程"],
  },
  {
    id: "mern-stack",
    name: "MERN (MongoDB + Express + React + Node.js)",
    languages: ["JavaScript", "TypeScript"],
    tags: ["全栈", "前端", "后端", "就业导向", "教学资料丰富", "跨平台", "需编程基础"],
    description:
      "前后端全用 JavaScript/TypeScript,MongoDB 存数据、Express 写接口、React 做界面,是最经典的『一门语言走天下』全栈组合,教程和面试题海量。",
    difficulty: "intermediate",
    typicalProjects: [
      "做一个带增删改查的任务清单全栈应用",
      "开发带用户认证和评论功能的博客平台",
      "搭建带实时聊天(Socket.io)的社交小应用",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 60,
    prerequisites: ["JavaScript 基础"],
  },
  {
    id: "nuxt3",
    name: "Nuxt 3 (Vue 全栈)",
    languages: ["TypeScript", "JavaScript"],
    tags: ["全栈", "前端", "入门友好", "性能要求高", "教学资料丰富", "跨平台"],
    description:
      "在 Vue 生态里用 Nuxt 3 同时写前端页面和服务端 API 路由,内置 SSR、文件路由和自动导入,一个项目搞定前后端。",
    difficulty: "intermediate",
    typicalProjects: [
      "搭建带 SEO 优化的个人作品集网站",
      "开发带服务端 API 的商品展示和购物车应用",
      "实现带用户系统和内容管理的小型内容站点",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 55,
    prerequisites: ["Vue 基础"],
  },
  {
    id: "t3-stack",
    name: "T3 Stack (Next.js + tRPC + Prisma + TypeScript)",
    languages: ["TypeScript"],
    tags: ["全栈", "前端", "后端", "生产级", "就业导向", "性能要求高", "需编程基础"],
    description:
      "用 tRPC 实现前后端类型安全的接口调用、Prisma 做数据库 ORM、Next.js 做界面和路由,是现代 TypeScript 全栈的『类型安全』代表组合。",
    difficulty: "advanced",
    typicalProjects: [
      "搭建类型安全的笔记应用(前后端共享类型)",
      "开发带订阅付费的 SaaS 产品原型",
      "实现带实时协作功能的多用户看板工具",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 45,
    prerequisites: ["TypeScript 基础", "React 基础", "了解数据库"],
  },
  {
    id: "supabase-react",
    name: "Supabase + React (BaaS 全栈)",
    languages: ["JavaScript", "TypeScript", "SQL"],
    tags: ["全栈", "前端", "零配置", "入门友好", "低代码", "教学资料丰富"],
    description:
      "用开源的 Firebase 替代品 Supabase 直接托管数据库、鉴权和文件存储,前端只需调用 SDK,不用自己搭后端服务器就能做出完整应用。",
    difficulty: "beginner",
    typicalProjects: [
      "做一个带邮箱登录的个人笔记应用",
      "开发带实时数据同步的多人留言板",
      "搭建带文件上传和权限控制的小型图片分享站",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 50,
    prerequisites: ["React 基础"],
  },
  {
    id: "r-tidyverse",
    name: "R + tidyverse",
    languages: ["R"],
    tags: ["数据分析", "可视化", "统计", "教学资料丰富", "学术导向", "需编程基础"],
    description:
      "用 R 语言和 tidyverse 系列包(dplyr/ggplot2 等)做数据清洗、统计建模和出版级图表,是学术研究和统计分析领域的主流工具。",
    difficulty: "intermediate",
    typicalProjects: [
      "清洗一份调查问卷数据并做描述性统计",
      "用 ggplot2 制作多变量对比的可视化报告",
      "对一组时间序列数据做回归分析并输出研究报告",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 45,
    prerequisites: ["统计学基础"],
  },
  {
    id: "power-bi",
    name: "Power BI",
    languages: ["DAX", "M"],
    tags: ["数据分析", "可视化", "商业智能", "入门友好", "低代码", "就业导向"],
    description:
      "用微软的商业智能工具 Power BI 拖拽式连接数据源、建模和制作交互式看板,不需要写太多代码就能产出面向业务汇报的分析报表。",
    difficulty: "beginner",
    typicalProjects: [
      "把 Excel 销售数据导入并制作月度业绩看板",
      "用 DAX 编写同比/环比等业务指标计算",
      "搭建连接数据库的自动刷新多页面分析报告",
    ],
    environment: ["windows", "macos"],
    priority: 50,
  },
  {
    id: "julia-scientific",
    name: "Julia (科学计算与数据分析)",
    languages: ["Julia"],
    tags: ["数据分析", "科学计算", "性能要求高", "需编程基础", "学术导向"],
    description:
      "用兼具 Python 易用性和接近 C 运行速度的 Julia 做数值计算和大规模数据处理,适合对性能有要求的科研和工程计算场景。",
    difficulty: "advanced",
    typicalProjects: [
      "实现常见数值算法(矩阵运算/插值)并对比性能",
      "对大规模数据集做统计建模和可视化",
      "搭建一个模拟物理系统的数值仿真小项目",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 25,
    prerequisites: ["编程基础", "线性代数基础"],
  },
  {
    id: "powershell",
    name: "PowerShell",
    languages: ["PowerShell"],
    tags: ["自动化", "运维", "入门友好", "跨平台"],
    description:
      "用微软官方的 PowerShell 编写 Windows/跨平台自动化脚本,批量管理文件、注册表、系统服务和 Office 文档,是 Windows 环境运维和办公自动化的首选。",
    difficulty: "beginner",
    typicalProjects: [
      "编写批量重命名和整理文件的脚本",
      "自动化处理 Excel/Word 文档并批量导出",
      "实现定时监控系统资源并发送告警邮件的脚本",
    ],
    environment: ["windows", "linux", "macos"],
    priority: 55,
  },
  {
    id: "ansible",
    name: "Ansible",
    languages: ["YAML"],
    tags: ["自动化", "运维", "企业级", "就业导向", "需编程基础"],
    description:
      "用无需在目标机器装 Agent 的 Ansible 编写声明式运维脚本,批量配置服务器、部署应用,是 DevOps 岗位的核心技能之一。",
    difficulty: "intermediate",
    typicalProjects: [
      "编写 Playbook 批量安装配置一组服务器的 Nginx",
      "实现多环境(测试/生产)应用自动化部署流程",
      "搭建包含角色和变量管理的完整基础设施配置方案",
    ],
    environment: ["linux", "macos"],
    priority: 40,
    prerequisites: ["Linux 基础", "了解 SSH"],
  },
  {
    id: "applescript-automator",
    name: "AppleScript + Automator (macOS 自动化)",
    languages: ["AppleScript"],
    tags: ["自动化", "入门友好", "零配置", "趣味性强"],
    description:
      "用 macOS 自带的 Automator 和 AppleScript 让 Mac 自动执行重复性操作,比如批量重命名文件、自动整理下载文件夹、控制其他应用完成任务。",
    difficulty: "beginner",
    typicalProjects: [
      "制作自动整理下载文件夹的工作流",
      "编写批量转换图片格式并重命名的脚本",
      "实现定时备份指定文件夹到移动硬盘的自动化流程",
    ],
    environment: ["macos"],
    priority: 30,
  },
  {
    id: "n8n",
    name: "n8n (低代码自动化平台)",
    languages: ["JavaScript"],
    tags: ["自动化", "低代码", "入门友好", "零配置", "趣味性强"],
    description:
      "用可视化拖拽节点的开源工作流工具 n8n,把不同 App 和 API(邮件、表格、聊天机器人等)连起来,不写多少代码就能搭建自动化流程。",
    difficulty: "beginner",
    typicalProjects: [
      "搭建新邮件自动同步到表格的工作流",
      "实现表单提交后自动发送通知到聊天群的流程",
      "连接多个 API 做定时数据同步和汇总报表",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 40,
  },
  {
    id: "go-cobra-cli",
    name: "Go + Cobra (CLI 工具开发)",
    languages: ["Go"],
    tags: ["CLI工具", "后端", "生产级", "性能要求高", "跨平台", "需编程基础"],
    description:
      "用 Kubernetes/Docker 同款的 Cobra 框架构建带子命令、参数校验和自动补全的命令行工具,编译成单文件跨平台分发,是写生产级 CLI 的主流选择。",
    difficulty: "intermediate",
    typicalProjects: [
      "编写一个批量重命名文件的命令行小工具",
      "开发带子命令的项目脚手架生成器 CLI",
      "实现可跨平台分发、带自动补全的运维工具 CLI",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 45,
    prerequisites: ["Go 语言基础"],
  },
  {
    id: "rust-clap-cli",
    name: "Rust + Clap (CLI 工具开发)",
    languages: ["Rust"],
    tags: ["CLI工具", "性能要求高", "生产级", "跨平台", "需编程基础"],
    description:
      "用 Rust 的 Clap 库开发极致快、内存安全的命令行工具,适合对性能和可靠性要求高的系统工具开发场景。",
    difficulty: "advanced",
    typicalProjects: [
      "实现一个类似 grep 的文本搜索命令行工具",
      "开发批量图片压缩处理的 CLI 工具",
      "编写带插件机制、可扩展的通用命令行框架",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 30,
    prerequisites: ["Rust 基础"],
  },
  {
    id: "node-oclif-cli",
    name: "Node.js + oclif (企业级 CLI 框架)",
    languages: ["TypeScript", "JavaScript"],
    tags: ["CLI工具", "企业级", "生产级", "就业导向", "跨平台"],
    description:
      "用 Salesforce/Heroku 同款的 oclif 框架构建结构化、可插件扩展的企业级命令行工具,适合已有 Node.js 基础、想做正式发布 CLI 产品的学习者。",
    difficulty: "intermediate",
    typicalProjects: [
      "搭建一个带多子命令的项目管理 CLI 脚手架",
      "开发可通过 npm 发布安装的自定义部署工具",
      "实现支持插件机制的可扩展 CLI 产品",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 35,
    prerequisites: ["JavaScript/TypeScript 基础"],
  },
  {
    id: "python-sklearn",
    name: "Python + scikit-learn (传统机器学习)",
    languages: ["Python"],
    tags: ["机器学习", "入门友好", "教学资料丰富", "需编程基础"],
    description:
      "用 scikit-learn 学习分类、回归、聚类等经典机器学习算法,从数据预处理到模型评估走完一个完整的机器学习项目流程。",
    difficulty: "intermediate",
    typicalProjects: [
      "用鸢尾花数据集训练一个分类模型",
      "做一个房价预测的回归模型并调参优化",
      "搭建端到端的客户流失预测项目(含特征工程和评估报告)",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 55,
    prerequisites: ["Python 基础", "了解 Pandas/NumPy"],
  },
  {
    id: "python-pytorch",
    name: "Python + PyTorch (深度学习)",
    languages: ["Python"],
    tags: ["机器学习", "深度学习", "性能要求高", "就业导向", "需编程基础"],
    description:
      "用学术界和工业界主流的 PyTorch 框架搭建和训练神经网络,从手写数字识别到自定义模型结构,打好深度学习工程基础。",
    difficulty: "advanced",
    typicalProjects: [
      "用 CNN 实现手写数字识别分类器",
      "训练一个图像分类模型并做迁移学习微调",
      "搭建一个简单的文本情感分析 RNN/Transformer 模型",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 45,
    prerequisites: ["Python 基础", "线性代数与微积分基础", "了解 NumPy"],
  },
  {
    id: "python-tensorflow-keras",
    name: "Python + TensorFlow/Keras",
    languages: ["Python"],
    tags: ["机器学习", "深度学习", "教学资料丰富", "就业导向", "需编程基础"],
    description:
      "用 Keras 高层 API 快速搭建和训练神经网络,再借助 TensorFlow 生态部署到网页、移动端或服务器,适合想让模型真正落地上线的学习者。",
    difficulty: "advanced",
    typicalProjects: [
      "用 Keras 搭建一个图像分类小模型",
      "训练模型后用 TensorFlow.js 部署到网页端实时推理",
      "实现一个可导出为移动端模型的轻量图像识别应用",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 40,
    prerequisites: ["Python 基础", "了解神经网络基本概念"],
  },
  {
    id: "python-huggingface-transformers",
    name: "Python + Hugging Face Transformers",
    languages: ["Python"],
    tags: ["机器学习", "深度学习", "自然语言处理", "就业导向", "需编程基础", "教学资料丰富"],
    description:
      "用 Hugging Face 生态直接调用和微调预训练大模型(BERT/GPT 等),不用从零训练就能做出文本分类、摘要、问答等 NLP 应用。",
    difficulty: "advanced",
    typicalProjects: [
      "用预训练模型做一个中文情感分类器",
      "微调模型实现自动文本摘要工具",
      "搭建一个基于检索增强的智能问答小系统",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 50,
    prerequisites: ["Python 基础", "了解机器学习基本概念"],
  },
  {
    id: "unity-csharp",
    name: "Unity (C#)",
    languages: ["C#"],
    tags: ["游戏开发", "跨平台", "就业导向", "生产级", "趣味性强", "需编程基础"],
    description:
      "用业界最主流的商业游戏引擎 Unity 和 C# 脚本,开发 2D/3D 游戏并一键发布到 PC、主机、移动端和 WebGL,是游戏行业最常见的技能要求。",
    difficulty: "intermediate",
    typicalProjects: [
      "制作一个 2D 平台跳跃小游戏",
      "开发带物理碰撞和敌人 AI 的 3D 小游戏关卡",
      "实现一个可发布到 Android/iOS 的完整手游 Demo",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 55,
    prerequisites: ["C# 基础"],
  },
  {
    id: "unreal-engine",
    name: "Unreal Engine (C++ / Blueprint)",
    languages: ["C++"],
    tags: ["游戏开发", "性能要求高", "生产级", "就业导向", "跨平台", "需编程基础"],
    description:
      "用顶尖 3A 游戏同款的虚幻引擎,通过可视化蓝图或 C++ 开发高保真 3D 游戏,是追求画面表现力和大型项目经验的首选引擎。",
    difficulty: "advanced",
    typicalProjects: [
      "用蓝图搭建一个第三人称角色控制场景",
      "开发带交互机制的解密类小游戏关卡",
      "实现一个带 AI 寻路和战斗系统的动作游戏 Demo",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 35,
    prerequisites: ["C++ 基础(使用蓝图可选)"],
  },
  {
    id: "phaserjs",
    name: "Phaser.js (Web 游戏)",
    languages: ["JavaScript"],
    tags: ["游戏开发", "前端", "入门友好", "趣味性强", "跨平台", "教学资料丰富"],
    description:
      "用纯 JavaScript 的 Phaser 框架直接在浏览器里做 2D 游戏,不用装引擎、写完就能发到网页上玩,适合已有前端基础想尝试游戏开发的学习者。",
    difficulty: "beginner",
    typicalProjects: [
      "制作一个打砖块小游戏",
      "开发带关卡和计分系统的跑酷游戏",
      "实现一个可在手机浏览器上玩的休闲益智游戏",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 50,
    prerequisites: ["JavaScript 基础"],
  },
  {
    id: "love2d-lua",
    name: "LÖVE (Lua 2D 游戏引擎)",
    languages: ["Lua"],
    tags: ["游戏开发", "入门友好", "轻量级", "趣味性强"],
    description:
      "用极简的 Lua 语言和轻量引擎 LÖVE,从零手写游戏循环、碰撞检测和渲染逻辑,更贴近理解游戏引擎底层原理,而不是套用现成组件。",
    difficulty: "beginner",
    typicalProjects: [
      "实现一个贪吃蛇小游戏",
      "制作一个带物理弹跳效果的弹球游戏",
      "开发一个带多关卡和存档功能的 2D 冒险小游戏",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 35,
  },
  {
    id: "python-pyqt-pyside",
    name: "Python + PyQt/PySide",
    languages: ["Python"],
    tags: ["桌面应用", "入门友好", "跨平台", "教学资料丰富"],
    description:
      "用 Python 搭配 Qt 界面库,给已经会写 Python 脚本的学习者一条路径,做出带按钮、表格、图表的正式桌面 GUI 程序。",
    difficulty: "intermediate",
    typicalProjects: [
      "把一个命令行小工具改造成带界面的桌面程序",
      "开发一个记账/待办事项桌面应用",
      "实现一个带图表展示的数据可视化桌面工具",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 45,
    prerequisites: ["Python 基础"],
  },
  {
    id: "dotnet-wpf-winui",
    name: ".NET + WPF/WinUI (C# 桌面应用)",
    languages: ["C#"],
    tags: ["桌面应用", "企业级", "生产级", "就业导向", "需编程基础"],
    description:
      "用微软官方桌面框架 WPF/WinUI 开发原生 Windows 桌面软件,支持数据绑定和自定义控件,是 Windows 平台企业软件开发的主流技术。",
    difficulty: "intermediate",
    typicalProjects: [
      "开发一个带数据绑定的联系人管理桌面应用",
      "制作一个企业内部使用的库存管理系统客户端",
      "实现一个带自定义控件和主题切换的桌面工具软件",
    ],
    environment: ["windows"],
    priority: 35,
    prerequisites: ["C# 基础"],
  },
  {
    id: "java-javafx",
    name: "Java + JavaFX/Swing",
    languages: ["Java"],
    tags: ["桌面应用", "跨平台", "教学资料丰富", "需编程基础"],
    description:
      "用 Java 自带的 JavaFX/Swing 图形库开发跨平台桌面程序,适合已学过 Java 基础、想做出看得见界面的完整应用的学习者。",
    difficulty: "intermediate",
    typicalProjects: [
      "开发一个计算器桌面小程序",
      "制作一个带数据库连接的学生信息管理系统",
      "实现一个带图表和文件导入导出功能的数据管理工具",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 30,
    prerequisites: ["Java 基础"],
  },
  {
    id: "java-algorithms",
    name: "Java 算法与数据结构",
    languages: ["Java"],
    tags: ["算法", "编程基础", "面试导向", "就业导向", "需编程基础"],
    description:
      "用 Java 实现常见数据结构(链表/树/图)和排序、查找、动态规划等经典算法,是准备大厂技术面试和 Java 后端岗位的基本功训练。",
    difficulty: "intermediate",
    typicalProjects: [
      "手写实现链表、栈、队列等基础数据结构",
      "实现常见排序算法并对比时间复杂度",
      "刷一组面试高频的动态规划和图论题目并整理解题模板",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 45,
    prerequisites: ["Java 基础"],
  },
  {
    id: "javascript-algorithms",
    name: "JavaScript 算法与数据结构",
    languages: ["JavaScript"],
    tags: ["算法", "编程基础", "前端", "入门友好", "就业导向"],
    description:
      "用前端最熟悉的 JavaScript 学习数据结构和算法,不用切换语言就能为前端面试和 LeetCode 刷题打基础。",
    difficulty: "intermediate",
    typicalProjects: [
      "用 JS 实现基础数据结构(哈希表/树)",
      "实现常见排序和搜索算法并可视化执行过程",
      "刷一组前端岗位高频算法题并整理解题思路笔记",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 40,
    prerequisites: ["JavaScript 基础"],
  },
  {
    id: "scratch-kids",
    name: "Scratch (少儿可视化编程入门)",
    languages: ["Scratch"],
    tags: ["编程基础", "入门友好", "零配置", "趣味性强", "教学资料丰富"],
    description:
      "用拖拽积木块的方式学习顺序、循环、条件判断等编程核心概念,不写一行代码就能理解程序是怎么『思考』的,适合零基础和青少年入门。",
    difficulty: "beginner",
    typicalProjects: [
      "制作一个角色对话的互动故事动画",
      "开发一个简单的猫捉老鼠小游戏",
      "实现一个带计分和多关卡的迷宫闯关游戏",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 40,
  },
  {
    id: "swift-swiftui",
    name: "Swift + SwiftUI (iOS 原生)",
    languages: ["Swift"],
    tags: ["移动开发", "就业导向", "生产级", "教学资料丰富", "需编程基础"],
    description:
      "用苹果官方语言 Swift 和声明式 UI 框架 SwiftUI 开发原生 iOS 应用,享受最流畅的系统集成和最新苹果特性支持。",
    difficulty: "intermediate",
    typicalProjects: [
      "开发一个带列表和详情页的待办事项 App",
      "制作一个调用系统相机和相册的照片处理 App",
      "实现一个带本地数据持久化和通知提醒的习惯打卡 App",
    ],
    environment: ["macos"],
    priority: 50,
    prerequisites: ["Swift 基础"],
  },
  {
    id: "kotlin-jetpack-compose",
    name: "Kotlin + Jetpack Compose (Android 原生)",
    languages: ["Kotlin"],
    tags: ["移动开发", "就业导向", "生产级", "教学资料丰富", "需编程基础"],
    description:
      "用 Google 主推的 Kotlin 和现代声明式 UI 工具包 Jetpack Compose,开发原生 Android 应用,是当前 Android 开发的官方推荐技术栈。",
    difficulty: "intermediate",
    typicalProjects: [
      "开发一个带列表刷新的新闻阅读 App",
      "制作一个调用定位和地图 API 的附近商家 App",
      "实现一个带本地数据库和后台同步的记账 App",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 50,
    prerequisites: ["Kotlin 基础"],
  },
  {
    id: "flutter-dart",
    name: "Flutter (Dart)",
    languages: ["Dart"],
    tags: ["移动开发", "跨平台", "就业导向", "生产级", "教学资料丰富", "需编程基础"],
    description:
      "用 Google 的 Flutter 框架和 Dart 语言一套代码同时发布 iOS、Android(甚至网页和桌面),是目前跨平台移动开发中性能和生态最成熟的方案之一。",
    difficulty: "intermediate",
    typicalProjects: [
      "开发一个跨平台的天气查询 App",
      "制作一个带本地存储的多语言笔记 App",
      "实现一个连接后端 API、带用户登录的社交类 App",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 55,
    prerequisites: ["Dart 基础(可边学边练)"],
  },
  {
    id: "react-native",
    name: "React Native",
    languages: ["TypeScript", "JavaScript"],
    tags: ["移动开发", "跨平台", "就业导向", "生产级", "教学资料丰富", "需编程基础"],
    description:
      "已经会 React 的前端开发者可以直接复用组件化思维,用 React Native 一套 JS 代码开发 iOS 和 Android 原生应用,是前端转移动端最顺滑的路径。",
    difficulty: "intermediate",
    typicalProjects: [
      "开发一个跨平台的记账 App",
      "制作一个调用相机和地理位置的打卡签到 App",
      "实现一个连接后端接口、带推送通知的社交类 App",
    ],
    environment: ["linux", "macos", "windows"],
    priority: 50,
    prerequisites: ["React 基础"],
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
