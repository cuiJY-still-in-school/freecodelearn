"""应用分类，返回 category 字段用于活动记录"""

_APP_RULES: list[tuple[list[str], str]] = [
    (['notion', 'obsidian', 'typora', 'marktext', 'logseq', 'roamresearch'], 'study_notes'),
    (['anki', 'personalac', 'duolingo', 'quizlet', 'memrise'], 'study_review'),
    (['vscode', 'code', 'pycharm', 'intellij', 'idea', 'clion', 'webstorm',
      'sublime', 'vim', 'neovim', 'emacs', 'cursor', 'zed', 'xcode'], 'coding'),
    (['terminal', 'iterm', 'cmd', 'powershell', 'wt', 'bash', 'zsh',
      'hyper', 'alacritty', 'wezterm', 'kitty', 'konsole', 'gnome-terminal'], 'coding'),
    (['word', 'docs', 'pages', 'wps', 'libreoffice writer'], 'study_writing'),
    (['excel', 'sheets', 'numbers', 'libreoffice calc'], 'study_writing'),
    (['powerpoint', 'keynote', 'impress', 'libreoffice impress'], 'study_writing'),
    (['pdf', 'foxit', 'adobe acrobat', 'evince', 'okular', 'zathura', 'preview'], 'study_reading'),
    (['kindle', 'readmoo', 'lithium', 'calibre'], 'study_reading'),
    (['bilibili', 'youtube', 'netflix', 'iqiyi', 'youku', 'mango tv',
      'tencent video', 'qq video', 'twitch'], 'entertainment_video'),
    (['steam', 'epicgames', 'epic games', 'roblox', 'minecraft', 'genshin',
      'origin', 'ubisoft', 'game', '游戏'], 'entertainment_game'),
    (['tiktok', 'douyin', 'kuaishou', 'instagram', 'twitter',
      'weibo', 'xiaohongshu', 'x.com'], 'entertainment_social'),
    (['wechat', 'weixin', 'qq', 'discord', 'telegram', 'whatsapp',
      'line', 'dingtalk', 'feishu', 'slack', 'teams'], 'communication'),
    (['chrome', 'chromium', 'firefox', 'safari', 'msedge', 'edge',
      'brave', 'opera', 'vivaldi', 'qqbrowser', 'sogouexplorer', '360se'], 'browser'),
    (['explorer', 'finder', 'nautilus', 'dolphin', 'thunar', 'ranger'], 'system'),
    (['settings', 'system preferences', 'control panel',
      'task manager', 'activity monitor', 'htop', 'top'], 'system'),
]

_URL_RULES: list[tuple[list[str], str]] = [
    (['github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com',
      'leetcode', 'codeforces', 'atcoder', 'acwing', 'luogu', 'lintcode'], 'coding'),
    (['khanacademy', 'coursera', 'edx.org', 'udemy', 'mooc', '学堂在线',
      '网易公开课', 'bilibili.com/video', 'bilibili.com/bangumi'], 'study_video'),
    (['wikipedia', 'baike.baidu', 'scholar.google', 'cnki.net',
      'wanfangdata', 'arxiv.org', 'semanticscholar', 'pubmed'], 'study_reading'),
    (['youtube.com', 'netflix.com', 'bilibili.com', 'iqiyi.com',
      'youku.com', 'twitch.tv', 'douyin.com'], 'entertainment_video'),
    (['twitter.com', 'x.com', 'weibo.com', 'instagram.com',
      'tiktok.com', 'xiaohongshu.com', 'zhihu.com'], 'entertainment_social'),
    (['store.steampowered', 'epicgames.com', 'roblox.com',
      'minecraft.net', 'hoyoverse', 'mihoyo'], 'entertainment_game'),
]

CATEGORY_NAMES: dict[str, str] = {
    'study_notes':        '学习笔记',
    'study_review':       '记忆复习',
    'study_video':        '学习视频',
    'study_writing':      '文档写作',
    'study_reading':      '阅读资料',
    'coding':             '编程开发',
    'browser':            '浏览器',
    'communication':      '即时通讯',
    'entertainment_video':'娱乐视频',
    'entertainment_game': '游戏娱乐',
    'entertainment_social':'社交媒体',
    'system':             '系统工具',
    'other':              '其他',
}

STUDY_CATEGORIES = frozenset({
    'study_notes', 'study_review', 'study_video',
    'study_writing', 'study_reading', 'coding',
})


def categorize(app_name: str, url: str = '') -> str:
    """返回应用分类 key，见 CATEGORY_NAMES"""
    if url:
        low_url = url.lower()
        for keywords, cat in _URL_RULES:
            if any(k in low_url for k in keywords):
                return cat

    low_app = app_name.lower().replace('.exe', '').strip()
    for keywords, cat in _APP_RULES:
        if any(k in low_app for k in keywords):
            return cat

    return 'other'
