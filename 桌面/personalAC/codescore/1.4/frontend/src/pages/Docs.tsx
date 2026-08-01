import React, { useState, useEffect, useRef } from 'react'

interface Section {
  id: string
  title: string
  content: React.ReactNode
}

interface Chapter {
  id: string
  title: string
  sections: Section[]
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', margin: '0 0 12px' }}>{children}</h2>
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', margin: '20px 0 8px' }}>{children}</h3>
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, margin: '0 0 14px' }}>{children}</p>
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, margin: '0 0 14px', paddingLeft: 20 }}>{children}</ul>
}

function OL({ children }: { children: React.ReactNode }) {
  return <ol style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, margin: '0 0 14px', paddingLeft: 20 }}>{children}</ol>
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--primary-light)', border: '1px solid var(--primary-ring)', borderRadius: 9, padding: '10px 14px', marginBottom: 14 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>提示</span>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--info-bg)', border: '1px solid var(--info-border)', borderRadius: 9, padding: '10px 14px', marginBottom: 14 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--info)', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>说明</span>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}

function Example({ lines }: { lines: string[] }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 9, padding: '12px 14px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>示例对话</span>
      {lines.map((l, i) => {
        const isUser = l.startsWith('你：') || l.startsWith('家长：') || l.startsWith('孩子：')
        const isAI = l.startsWith('AI：')
        const isSystem = l.startsWith('（') || l.startsWith('[')
        return (
          <div key={i} style={{
            fontSize: 13,
            color: isUser ? 'var(--primary)' : isAI ? 'var(--text)' : 'var(--text-muted)',
            lineHeight: 1.6,
            fontStyle: isAI ? 'normal' : isSystem ? 'italic' : 'normal',
            paddingLeft: isAI ? 10 : 0,
            borderLeft: isAI ? '2px solid var(--border)' : 'none',
          }}>
            {l}
          </div>
        )
      })}
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code style={{ background: 'var(--bg-secondary)', padding: '1px 7px', borderRadius: 4, fontSize: 12.5, fontFamily: 'monospace', color: 'var(--primary)' }}>{children}</code>
}

const CHAPTERS: Chapter[] = [
  {
    id: 'start',
    title: '快速开始',
    sections: [
      {
        id: 'overview',
        title: '什么是 PersonalAC',
        content: (
          <>
            <P>PersonalAC 是一个家庭 AI 学习助手，专为「监护人 + 孩子」组合设计。核心设计理念：AI 不只回答问题——它主动追踪学习状态、记录知识点掌握情况、安排间隔复习、提醒任务，必要时主动联系家长。</P>
            <P>两种角色，一套系统：</P>
            <UL>
              <li><b>学生</b>：和 AI 对话、提问、记录学习、完成待办、管理复习卡片</li>
              <li><b>监护人（家长）</b>：布置任务、查看学情、接收报告、和孩子共享同一套 AI</li>
            </UL>
            <P>与普通 AI 聊天工具的区别：</P>
            <UL>
              <li>AI 知道孩子在学什么、掌握了什么、哪里卡住了——每次对话都有上下文</li>
              <li>AI 会主动出击：发现薄弱点会主动提醒，到了提醒时间会主动推送消息</li>
              <li>家长和孩子的对话相互可见，家长可以布置任务、发图给孩子</li>
            </UL>
            <Tip>PersonalAC 运行在你自己的服务器上，对话数据不会发送给第三方。AI 接口使用你自己配置的 API Key。</Tip>
          </>
        ),
      },
      {
        id: 'guardian-register',
        title: '家长注册账号',
        content: (
          <>
            <P>打开首页，点「免费注册」。填写邮箱、密码和显示名称，创建监护人账号。</P>
            <Note>注册即享 7 天免费使用，无需兑换码。7 天后需要联系微信 <Code>kaixin_jason</Code> 获取兑换码续费。每个兑换码激活后有效期 30 天。</Note>
            <P>注册后，进入左侧菜单「账号管理」，添加孩子信息：</P>
            <UL>
              <li>孩子的名字（用于 AI 称呼孩子）</li>
              <li>年级（AI 根据年级调整解释深度）</li>
              <li>学习科目（AI 知道孩子学哪些科目）</li>
            </UL>
            <P>填写后，系统生成一个邀请链接和邀请码，发给孩子激活。</P>
            <Tip>邀请码是一次性的，孩子激活后失效。如果孩子换设备或忘记密码，可以在账号管理里重置——生成新邀请码让孩子重新激活。</Tip>
          </>
        ),
      },
      {
        id: 'student-activate',
        title: '孩子激活账号',
        content: (
          <>
            <P>家长把邀请链接发给孩子（微信、短信均可）。孩子点开链接，或在首页输入邀请码，填写：</P>
            <OL>
              <li>自己的名字（可与家长填的不同，这是孩子的显示名）</li>
              <li>设置密码</li>
              <li>（推荐）绑定邮箱——用于在其他设备用验证码登录，不需要记密码</li>
            </OL>
            <P>激活后，孩子的账号自动关联到家长账号，双方的 AI 共享同一个孩子档案。</P>
            <Tip>邮箱不是必填的，但建议绑定。绑定后可以在手机、iPad、电脑上通过「邮箱 + 验证码」登录，不需要记密码。没有绑定邮箱的学生只能在设置了密码的设备上用密码登录。</Tip>
          </>
        ),
      },
      {
        id: 'first-chat',
        title: '第一次对话',
        content: (
          <>
            <P>激活后直接进入 AI 对话界面。AI 已经知道孩子的科目、年级，不需要重新自我介绍。</P>
            <Example lines={[
              '孩子：我今天在学二次函数，抛物线的顶点公式看不懂',
              'AI：好，我们理一下。顶点公式 x = -b/(2a) 是从配方推出来的。你知道怎么对 ax²+bx+c 配方吗？',
              '孩子：不太会',
              'AI：好，我们先看一个具体的例子：x²+4x+3……',
            ]} />
            <P>不用担心「说什么」——想到什么说什么，哪道题不会、哪个概念没懂，直接说。AI 会引导对话方向，必要时主动追问或出题验证。</P>
          </>
        ),
      },
      {
        id: 'devices',
        title: '多设备使用',
        content: (
          <>
            <P>PersonalAC 是网页应用，在手机浏览器、iPad、电脑上都能用，响应式设计。推荐用 Safari（iOS）或 Chrome 打开。</P>
            <P>登录方式：</P>
            <UL>
              <li><b>密码登录</b>：邮箱 + 密码，适合固定设备</li>
              <li><b>验证码登录</b>：邮箱 + 6 位验证码（发到邮箱），适合临时设备，不需要记密码</li>
            </UL>
            <P>同一账号可以同时在多台设备登录，消息和数据实时同步。</P>
            <Tip>在 iPhone 上：打开网页后，点 Safari 底部「分享」按钮 → 「添加到主屏幕」，可以像 App 一样从桌面启动，有全屏体验。</Tip>
          </>
        ),
      },
    ],
  },
  {
    id: 'chat',
    title: 'AI 对话',
    sections: [
      {
        id: 'basic-qa',
        title: '提问 & 讲解',
        content: (
          <>
            <P>最基础的用法：直接提问。AI 会根据孩子的年级和科目给出合适的解释层级——不会用大学教材解释初中题，也不会把高中题讲得过于简单。</P>
            <P>如果第一次解释没听懂，说「换一种方法」——AI 会依次尝试：换公式推导、数值举例、类比、图示描述、反例。</P>
            <Example lines={[
              '孩子：牛顿第二定律我理解了',
              'AI：好，来一道题验证一下：一个 2 kg 的物体受到 10 N 的合力，加速度是多少？',
              '孩子：5 m/s²',
              'AI：对了。[已更新：牛顿第二定律，置信度 +15%] 那如果质量翻倍，同样的力，加速度变成多少？',
            ]} />
            <Tip>AI 会在你说「我会了」后出题验证，答对才会记录该知识点掌握。自己说会了不算，验证了才算。</Tip>
          </>
        ),
      },
      {
        id: 'image-ocr',
        title: '拍照上传 & 识别',
        content: (
          <>
            <P>点击输入框左侧的图片图标，或直接将截图粘贴进输入框。AI 会自动识别图片内容，然后进行分析。</P>
            <P>支持的场景：</P>
            <UL>
              <li>试卷拍照、作业截图——AI 识别题目并分析</li>
              <li>教材截图——AI 解释内容</li>
              <li>成绩单——AI 分析成绩分布</li>
              <li>错题拍照——AI 指出错误并讲解正确做法</li>
            </UL>
            <Example lines={[
              '孩子：[上传试卷截图]',
              'AI：识别到 4 道题。第 3 题：你选了 B，但正确答案是 C。这道题考动量守恒，解题关键是……',
            ]} />
            <Note>图片识别由 AI 视觉模型完成（与文字对话使用同一个 AI 接口），需要配置支持视觉的模型（如 gpt-4o、claude-3-5-sonnet、MiniMax 视觉版等）。</Note>
          </>
        ),
      },
      {
        id: 'voice',
        title: '语音输入',
        content: (
          <>
            <P>长按输入框右侧的麦克风按钮，说话，松开后 AI 自动识别文字。识别完成后可以编辑，确认后再发送。</P>
            <P>适用场景：</P>
            <UL>
              <li>手边没空打字时（比如在做题中间想快速问一下）</li>
              <li>描述题目比较复杂，说比打快</li>
              <li>在手机上用——语音比手机键盘快</li>
            </UL>
            <Note>语音识别使用浏览器原生 Web Speech API，需要授权麦克风权限。在 Chrome 和 Edge 上效果最好；Safari 也支持，但识别速度略慢。在 HTTP 环境下（非 HTTPS）部分浏览器会拒绝麦克风权限。</Note>
          </>
        ),
      },
      {
        id: 'wolfram',
        title: 'WolframAlpha 精确计算',
        content: (
          <>
            <P>当遇到数学计算、方程、积分、导数、物理单位换算等问题时，AI 会调用 WolframAlpha 给出精确结果和步骤，而不是自己估算（AI 做数值计算容易出错）。</P>
            <Example lines={[
              '孩子：帮我解方程 2x²-5x+3=0',
              'AI：[调用 WolframAlpha] 解为 x = 3/2 或 x = 1。验证：将 x = 1.5 代入 2(1.5)²-5(1.5)+3 = 4.5-7.5+3 = 0，正确。',
            ]} />
            <UL>
              <li>方程求解（一元、多元）</li>
              <li>积分与微分</li>
              <li>矩阵运算</li>
              <li>物理公式计算</li>
              <li>单位换算</li>
            </UL>
            <Tip>WolframAlpha 需要在「系统配置」里填写 App ID 才能启用。可以在 WolframAlpha 官网免费申请开发者账号，每月有免费额度。</Tip>
          </>
        ),
      },
      {
        id: 'relay',
        title: '图片互传给对方',
        content: (
          <>
            <P>上传一张图片后，可以让 AI 把这张图转发给家长或孩子，并附带说明。</P>
            <Example lines={[
              '家长：[上传题目截图] 把这道题发给开心，让他今晚做一下',
              'AI：好，已将图片转发给开心，附言：今晚完成这道题哦。',
              '',
              '孩子：[上传作业截图] 发给妈妈看一下',
              'AI：已转发给妈妈。',
            ]} />
            <P>反过来也可以：孩子发作业截图给家长看，家长发错题图给孩子练习。</P>
          </>
        ),
      },
      {
        id: 'context',
        title: '对话记忆 & 历史',
        content: (
          <>
            <P>每次对话的内容会保存在本地（浏览器），下次打开可以继续。AI 在同一次对话里记得之前说过什么，可以引用之前的内容。</P>
            <P>如果想开始一段全新对话（清除上下文），点输入框上方的「清除」按钮。清除只影响当前对话的上下文，知识点记录和待办不会受影响。</P>
            <P>也可以导出对话历史为文本，点聊天顶部菜单里的「导出对话」。</P>
            <Note>对话历史保存在浏览器本地存储（localStorage），换设备或清除浏览器数据后会丢失。知识点、待办等结构化数据保存在服务器，不会丢失。</Note>
          </>
        ),
      },
    ],
  },
  {
    id: 'tasks',
    title: '任务 & 提醒',
    sections: [
      {
        id: 'todo',
        title: '智能待办',
        content: (
          <>
            <P>待办可以在对话里直接创建，也可以在「待办」页面手动添加。对话方式更自然：</P>
            <Example lines={[
              '孩子：帮我记一下，明天要交英语作文',
              'AI：已创建待办「交英语作文」，截止明天，高优先级。',
              '',
              '孩子：我做完数学作业了',
              'AI：[查询待办列表，找到「数学作业」] 已标记完成！今天完成了 2 个任务，继续加油。',
            ]} />
            <P>AI 会自动推断优先级（根据截止时间远近和描述中的紧迫感）和截止时间（「明天」「下周五」「三天后」都能理解）。</P>
            <H3>家长布置任务</H3>
            <P>家长在自己的对话界面说「给开心建一个任务」，AI 会在孩子的待办列表里创建。孩子下次打开时会看到新任务。</P>
            <H3>待办页面</H3>
            <P>「待办」页面可以：</P>
            <UL>
              <li>按状态筛选：全部 / 待完成 / 已完成 / 已逾期</li>
              <li>按优先级排序</li>
              <li>查看逾期数量</li>
              <li>手动创建、编辑、删除待办</li>
            </UL>
            <Tip>AI 每 30 分钟自动扫描一次待办，发现逾期未完成的任务会主动推送提醒（在 6:00–22:00 之间）。</Tip>
          </>
        ),
      },
      {
        id: 'schedule',
        title: '定时唤醒',
        content: (
          <>
            <P>AI 可以自己安排提醒——在指定时间主动推送消息给学生或家长。不需要手动设日历，在对话里说一句就够。</P>
            <Example lines={[
              '孩子：明天晚上 8 点提醒我背第 5 单元的单词',
              'AI：好，已安排：明天 20:00 给你发「该背第 5 单元单词了！」',
              '（第二天 20:00，右上角铃铛亮起）',
              'AI：⏰ 该背第 5 单元单词了！加油。',
            ]} />
            <P>支持的时间表达：</P>
            <UL>
              <li>具体时间：「明天上午 10 点」「后天下午 3 点半」</li>
              <li>相对时间：「3 小时后」「两天后」「下周一早上」</li>
              <li>自然语言：「睡前提醒我」（AI 会设在 21:00）</li>
            </UL>
            <P>管理现有提醒：</P>
            <UL>
              <li>「有哪些提醒？」——列出所有待执行的唤醒</li>
              <li>「取消提醒」或「取消那个背单词的提醒」——取消指定提醒</li>
            </UL>
            <Tip>唤醒可以发给学生、家长或两者。家长也可以说「明天提醒开心做作业」——AI 会在那个时间主动发消息给孩子。</Tip>
          </>
        ),
      },
      {
        id: 'notifications',
        title: '通知推送机制',
        content: (
          <>
            <P>右上角的铃铛图标显示未读通知数。通知有两种来源：</P>
            <H3>实时通知（SSE）</H3>
            <P>浏览器打开时，通知实时到达（Server-Sent Events 长连接）。AI 发消息、待办逾期提醒、家长发图给孩子——这些都会立即显示在铃铛里。</P>
            <H3>离线消息</H3>
            <P>关闭浏览器期间产生的通知，下次打开时自动加载。定时唤醒到期后，下次打开 app 就能看到 AI 发的消息。</P>
            <P>后台自动任务时间表：</P>
            <UL>
              <li><b>每 30 分钟</b>（:15 和 :45）：扫描每个学生的待办和薄弱知识点，发现逾期或急需关注时推送通知</li>
              <li><b>每小时</b>：刷新「清醒视角」快照（AI 在对话开始前读取的学情摘要）</li>
              <li><b>每周日 20:00</b>：生成并推送学情周报</li>
              <li><b>凌晨 3:00</b>：数据库自动备份</li>
            </UL>
          </>
        ),
      },
    ],
  },
  {
    id: 'knowledge',
    title: '知识体系',
    sections: [
      {
        id: 'kp',
        title: '知识点追踪',
        content: (
          <>
            <P>AI 在对话中自动记录每个知识点的掌握程度，用 0–100% 的置信度量化。规则：</P>
            <UL>
              <li>答对题目：置信度 +15%</li>
              <li>答错或回答模糊：置信度 -10%</li>
              <li>主动说「我懂了」但未验证：置信度小幅提升（+5%），需要出题确认后才大幅更新</li>
            </UL>
            <P>在「学习进度」页面可以看到：</P>
            <UL>
              <li>所有已记录知识点及其掌握程度</li>
              <li>各科目的掌握分布（雷达图）</li>
              <li>最薄弱的知识点列表</li>
            </UL>
            <H3>批量更新</H3>
            <P>家长上传试卷截图时，AI 会逐题分析，批量更新知识点。一张试卷能同时更新多个知识点的置信度，效率远高于逐个对话。</P>
            <Example lines={[
              '家长：[上传月考试卷] 帮我分析一下开心这次的试卷',
              'AI：识别到 15 道题。分析完成：知识点「牛顿第二定律」置信度从 70% 更新到 85%（答对大题）；「摩擦力计算」从 55% 降到 40%（第 8 题算错方向）……',
            ]} />
            <Tip>AI 的知识点记录依赖对话内容，没有对话就没有更新。建议孩子在学完一个知识点后，在对话里让 AI 考一考，这样记录最准确。</Tip>
          </>
        ),
      },
      {
        id: 'srs',
        title: 'SRS 间隔复习',
        content: (
          <>
            <P>SRS（Spaced Repetition System，间隔重复系统）是目前最科学的记忆方法。PersonalAC 内置了完整的 SRS 流程。</P>
            <H3>如何加入复习</H3>
            <P>在 AI 讲解完一个知识点后，消息底部会出现「加入复习」按钮，点击即可创建复习卡片。也可以在对话里直接说：</P>
            <Example lines={[
              '孩子：把今天学的动量守恒加进复习计划',
              'AI：已加入，3 天后提醒你复习「动量守恒定律」。',
            ]} />
            <H3>复习流程</H3>
            <P>在「间隔复习」页面，到期的卡片会出现（正面显示知识点名称或问题）。</P>
            <OL>
              <li>先回忆——不要直接翻开</li>
              <li>翻开卡片，看正确答案或解释</li>
              <li>给自己评分：<b>忘了</b> / <b>模糊</b> / <b>记得</b> / <b>很熟</b></li>
              <li>系统根据评分计算下次复习时间</li>
            </OL>
            <P>间隔曲线（近似）：</P>
            <UL>
              <li>第 1 次：1 天后</li>
              <li>答对：×2 间隔；答错：重置到 1 天</li>
              <li>随着连续记住，间隔拉长到 3→7→14→30→90 天…</li>
            </UL>
            <Tip>每天复习到期的卡片，哪怕只有 5 分钟，效果远好于临考前集中背诵。</Tip>
          </>
        ),
      },
      {
        id: 'prerequisites',
        title: '前置知识诊断',
        content: (
          <>
            <P>当 AI 尝试多种方式解释，孩子还是没有理解时，AI 会主动诊断：是不是缺少前置知识？</P>
            <Example lines={[
              'AI：你学不懂「导数定义」，可能是因为「极限」的概念没稳固。我们先补一下极限的直觉，再回来看导数？',
              '孩子：好',
              'AI：[切换到极限讲解] 想象你走向一堵墙，每步走剩余距离的一半……',
              '（讲完极限后）',
              'AI：好，现在再看导数——f\'(x) = lim(h→0) [f(x+h)-f(x)]/h——这个极限的意思是……',
            ]} />
            <P>AI 会把诊断出的前置缺口记录为知识点薄弱项，并在清醒视角里提示家长。</P>
          </>
        ),
      },
      {
        id: 'sobriety',
        title: '清醒视角',
        content: (
          <>
            <P>「清醒视角」是 AI 维护的一份孩子当前学情摘要，每小时自动更新一次。内容包括：</P>
            <UL>
              <li>最薄弱的 3 个知识点（置信度最低）</li>
              <li>即将逾期的待办任务</li>
              <li>持续卡壳的概念</li>
              <li>近期对话中反复出错的地方</li>
            </UL>
            <P>这份摘要会在每次对话开始前被 AI 读取，让 AI 在对话里主动引导孩子关注最需要的内容，而不是被动等孩子提问。</P>
            <P>家长问「孩子最近状态怎么样」时，AI 会直接基于清醒视角给出准确答复。</P>
            <Tip>清醒视角就是 AI 的「工作记忆」——哪怕孩子没有主动提这道题，AI 也知道它还没掌握，会在合适的时机提起。</Tip>
          </>
        ),
      },
    ],
  },
  {
    id: 'guardian',
    title: '家长功能',
    sections: [
      {
        id: 'grades',
        title: '成绩管理',
        content: (
          <>
            <P>在「成绩」页面手动录入考试成绩，也可以在对话里直接告诉 AI：</P>
            <Example lines={[
              '家长：开心这次数学 87 分，物理 72 分，英语 91 分',
              'AI：已记录。数学比上次（82 分）提高了 5 分，物理（上次 78 分）下降了 6 分。物理薄弱知识点目前有「摩擦力计算」和「电场强度」，我来分析一下……',
            ]} />
            <P>「成绩」页面提供：</P>
            <UL>
              <li>历次成绩趋势折线图</li>
              <li>按科目筛选</li>
              <li>与平均分对比</li>
            </UL>
          </>
        ),
      },
      {
        id: 'progress',
        title: '学习进度 & 打卡',
        content: (
          <>
            <P>「学习进度」页面显示孩子的打卡记录（连续学习天数）和知识点掌握概览。</P>
            <P>学生每天有 AI 对话，系统自动记为「打卡」——无需手动操作。连续打卡天数显示在学生主页。</P>
            <P>家长在「学习进度」里能看到：</P>
            <UL>
              <li>过去 30 天的学习活跃度（热力图）</li>
              <li>各科目知识点掌握率</li>
              <li>本周学了哪些新知识点</li>
            </UL>
          </>
        ),
      },
      {
        id: 'radar',
        title: '六维学情雷达图',
        content: (
          <>
            <P>AI 会根据对话和知识点数据，定期生成一张六维雷达图，维度包括：</P>
            <UL>
              <li>学习主动性（是否主动发起对话、提问）</li>
              <li>知识掌握度（平均置信度）</li>
              <li>任务完成率（待办完成情况）</li>
              <li>复习坚持度（SRS 卡片完成情况）</li>
              <li>理解深度（提问质量、能否举一反三）</li>
              <li>注意力（单次对话时长和专注程度）</li>
            </UL>
            <P>AI 可以手动触发更新：「分析一下开心的学情，更新雷达图」。家长在主页可以直观看到孩子在哪个维度薄弱。</P>
          </>
        ),
      },
      {
        id: 'weekly',
        title: '学情周报',
        content: (
          <>
            <P>每周日 20:00，系统自动生成学情报告并推送通知（同时发到绑定邮箱，需配置 Resend 邮件服务）。</P>
            <P>报告内容：</P>
            <UL>
              <li>本周待办完成率（完成数 / 总数）</li>
              <li>知识点复习情况（新增了哪些，哪些置信度提升 / 下降）</li>
              <li>和 AI 对话的次数和时长</li>
              <li>薄弱知识点 Top 3</li>
              <li>AI 给家长的一条具体建议</li>
            </UL>
            <P>也可以随时在对话里让 AI 生成即时报告：「给我出一份本周的学情报告」。</P>
          </>
        ),
      },
      {
        id: 'accounts',
        title: '账号管理',
        content: (
          <>
            <P>家长在「账号管理」页面可以：</P>
            <UL>
              <li>查看孩子账号状态（是否已激活、上次登录时间）</li>
              <li>修改孩子的科目、年级信息</li>
              <li>重置孩子账号（生成新邀请码，让孩子在新设备重新激活）</li>
              <li>查看自己账号的订阅状态和到期时间</li>
            </UL>
            <Note>重置孩子账号不会删除孩子的学习数据（知识点、待办、成绩都保留），只是重新激活流程，方便孩子在新设备登录。</Note>
          </>
        ),
      },
      {
        id: 'agent-logs',
        title: 'AI 行动日志',
        content: (
          <>
            <P>在「AI 日志」页面，可以看到 AI 在后台做过的所有操作，包括：</P>
            <UL>
              <li>记录了哪些知识点（及置信度变化）</li>
              <li>创建或更新了哪些待办</li>
              <li>触发了哪些定时唤醒</li>
              <li>发送了哪些通知</li>
              <li>心跳扫描发现了什么</li>
            </UL>
            <P>每条日志包含时间戳、操作类型和详细内容。如果家长觉得 AI「莫名其妙」做了什么，可以在这里查看原因。</P>
          </>
        ),
      },
    ],
  },
  {
    id: 'files',
    title: '客户端 & 文件同步',
    sections: [
      {
        id: 'drive',
        title: '文件存储',
        content: (
          <>
            <P>PersonalAC 提供基础的文件存储功能，入口在左侧菜单「文件」页面。有两种方式把文件存进去：</P>
            <H3>网页手动上传</H3>
            <P>在「文件」页面点「上传文件」，选择本地文件上传到服务器。支持新建文件夹、预览文本/图片、删除。</P>
            <H3>客户端自动同步（需安装客户端）</H3>
            <P>安装学生端客户端并在设置里开启「文件同步」后，指定本地文件夹，文件夹内容会自动同步到服务器。</P>
            <Note>这不是 Google Drive 那样的通用网盘，容量和功能有限。主要用途是让 AI 能读取学习资料、让家长查看孩子上传的作业截图。</Note>
            <H3>家长查看</H3>
            <P>家长在「文件」页面顶部切换学生，可以查看、下载、删除孩子的文件。</P>
            <Tip>文件保存在服务器，换设备不会丢失。</Tip>
          </>
        ),
      },
      {
        id: 'client',
        title: '学生端客户端',
        content: (
          <>
            <P>除了网页版，PersonalAC 提供学生端原生客户端，支持 <b>Windows、Mac、Android</b>。客户端主要面向需要设备管理功能的家庭使用。</P>
            <H3>主要功能</H3>
            <UL>
              <li><b>截图监控</b>：每隔 N 分钟自动截图，上传到服务器，家长可在「屏幕时间」页面查看</li>
              <li><b>必做任务锁</b>：家长设置「必做」任务后，只要有未完成的必做任务，孩子设备进入锁定模式（仅允许操作 PersonalAC），完成后自动解锁</li>
              <li><b>应用黑名单</b>：家长配置禁止使用的 App，客户端检测到后自动关闭</li>
              <li><b>Pet 模式</b>：没有未完成必做任务时，设备处于正常模式（"pet 模式"），桌面可见宠物图标</li>
            </UL>
            <H3>下载安装</H3>
            <P>家长在 PersonalAC 左侧菜单「下载客户端」页面，选择对应平台下载：</P>
            <UL>
              <li><b>Android</b>：下载 APK，打开文件管理器安装（需在「设置 → 安全」里允许「未知来源」）</li>
              <li><b>Windows</b>：下载 zip，解压后运行 personalac-student.exe</li>
              <li><b>Mac</b>：下载 DMG，拖入「应用程序」文件夹</li>
            </UL>
            <H3>首次连接</H3>
            <P>安装并打开客户端后，粘贴家长生成的邀请链接（格式：<Code>https://你的服务器地址/join/邀请码</Code>），客户端自动连接到对应的服务器并完成账号关联。</P>
            <Note>客户端需要和 PersonalAC 服务器在同一局域网，或服务器配置了公网访问（域名或公网 IP）。纯本地部署只能局域网内使用。</Note>
            <H3>家长配置客户端</H3>
            <P>家长在「账号管理」→「客户端配置」里设置：</P>
            <UL>
              <li>截图间隔（分钟）</li>
              <li>禁用 App 列表（填 App 包名或窗口标题）</li>
              <li>是否启用必做任务锁</li>
            </UL>
            <P>配置保存后，客户端下次上报心跳时自动拉取新配置，无需重新安装。</P>
          </>
        ),
      },
      {
        id: 'screen-time',
        title: '屏幕时间 & 截图',
        content: (
          <>
            <P>客户端运行时，按照配置的间隔（默认 10 分钟）自动截图并上传。家长在「屏幕时间」页面可以：</P>
            <UL>
              <li>按日期查看截图时间线</li>
              <li>点击放大查看截图详情</li>
              <li>查看当天的活跃时段统计</li>
            </UL>
            <P>服务器最多保留最近 120 张截图（约 20 小时），旧截图自动删除。</P>
            <Tip>截图功能是可选的——如果家长觉得侵犯隐私，把截图间隔设为 0 即可关闭，其他功能（锁定、黑名单）不受影响。</Tip>
          </>
        ),
      },
    ],
  },
  {
    id: 'advanced',
    title: '高级 & 配置',
    sections: [
      {
        id: 'config',
        title: '系统配置',
        content: (
          <>
            <P>家长在「系统配置」页面（左侧菜单最底部的齿轮图标）配置各项服务。配置只有家长能修改。</P>
            <H3>AI 接口</H3>
            <P>PersonalAC 支持任何兼容 OpenAI 格式的 AI 接口：</P>
            <UL>
              <li><b>MiniMax</b>：国内速度快，支持视觉，有免费额度（默认推荐）</li>
              <li><b>OpenAI</b>：gpt-4o 视觉效果最好</li>
              <li><b>Claude</b>（Anthropic）：推理能力强</li>
              <li><b>其他兼容接口</b>：填写 base URL + API Key 即可</li>
            </UL>
            <P>配置项：API Key、模型名称、base URL（非 OpenAI 官方时填写）。</P>
            <H3>邮件服务（Resend）</H3>
            <P>用于发送验证码邮件和周报邮件。在 Resend 官网注册，复制 API Key 填入。免费账号每月可发 3000 封邮件，完全够用。</P>
            <H3>WolframAlpha</H3>
            <P>填写 App ID 启用精确计算功能。在 WolframAlpha Developer Portal 申请，选 Simple API 或 Full Results API 均可。</P>
            <H3>免打扰时段</H3>
            <P>AI 在免打扰时段不会主动发通知（定时唤醒除外——你主动设的提醒还是会发）。默认 22:00–6:00 不打扰。</P>
          </>
        ),
      },
      {
        id: 'redeem',
        title: '兑换码 & 订阅',
        content: (
          <>
            <P>注册即享 7 天免费试用。7 天结束后，需要兑换码才能继续使用。</P>
            <P>获取兑换码：添加微信 <Code>kaixin_jason</Code>，告知你的邮箱，获取兑换码。每个码有效期 30 天，一次性使用（不可重复激活）。</P>
            <H3>激活兑换码</H3>
            <P>订阅到期后，登录时会出现兑换墙。输入兑换码点「激活使用」即可，无需重新注册或重新设置。</P>
            <H3>到期提醒</H3>
            <P>订阅还剩 7 天以内时，页面顶部会出现橙色提醒条，提示剩余天数和续费联系方式。</P>
          </>
        ),
      },
      {
        id: 'backup',
        title: '数据备份',
        content: (
          <>
            <P>PersonalAC 每天凌晨 3:00 自动备份数据库。备份文件保存在服务器本地。家长也可以在「系统配置」页面手动触发备份。</P>
            <P>备份内容包括：</P>
            <UL>
              <li>所有用户账号信息</li>
              <li>知识点记录</li>
              <li>待办任务</li>
              <li>成绩记录</li>
              <li>SRS 复习卡片</li>
              <li>文件存储数据</li>
            </UL>
            <Note>备份是数据库文件，不是对话历史。对话历史存在每个用户的浏览器本地，不在备份范围内。</Note>
          </>
        ),
      },
      {
        id: 'faq',
        title: '常见问题',
        content: (
          <>
            <H3>AI 不理解我的问题怎么办？</H3>
            <P>换一种说法，或者把问题分解成更小的步骤。也可以直接说「你理解了我的问题吗？」让 AI 复述一遍。</P>

            <H3>孩子在移动端怎么用？</H3>
            <P>用手机浏览器打开网址，Safari（iOS）或 Chrome 均可。推荐「添加到主屏幕」作为桌面快捷方式。</P>

            <H3>通知没有收到？</H3>
            <P>通知需要页面打开才能实时接收（SSE 长连接）。如果 AI 在你关闭浏览器时发了消息，下次打开自动加载。如果实时通知不工作，检查浏览器是否被防火墙拦截了 EventSource 连接。</P>

            <H3>两个孩子能用同一个家长账号吗？</H3>
            <P>目前每个家长账号支持管理一个孩子账号。多个孩子需要创建多个家长账号。</P>

            <H3>WolframAlpha 调用失败？</H3>
            <P>检查配置页面里的 App ID 是否正确，以及 WolframAlpha 免费额度是否用完（每月有限制）。也可以先不开 WolframAlpha，AI 会用自己的方式计算（精度略低）。</P>

            <H3>忘记密码？</H3>
            <P>在登录页面点「验证码登录」，用邮箱 + 收到的 6 位验证码登录（需绑定邮箱）。登录后在设置里重置密码。</P>
          </>
        ),
      },
    ],
  },
]

export default function Docs(): React.ReactElement {
  const [activeId, setActiveId] = useState('overview')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const allSections = CHAPTERS.flatMap(c => c.sections)
  const activeSection = allSections.find(s => s.id === activeId) ?? allSections[0]

  function scrollTo(id: string) {
    setActiveId(id)
    setMobileNavOpen(false)
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const idx = allSections.findIndex(s => s.id === activeId)
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' && idx < allSections.length - 1) scrollTo(allSections[idx + 1].id)
      if (e.key === 'ArrowUp' && idx > 0) scrollTo(allSections[idx - 1].id)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeId])

  const idx = allSections.findIndex(s => s.id === activeId)
  const prevSection = idx > 0 ? allSections[idx - 1] : null
  const nextSection = idx < allSections.length - 1 ? allSections[idx + 1] : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'system-ui,-apple-system,sans-serif', color: 'var(--text)' }}>

      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--bg)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 clamp(16px,4vw,48px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>PersonalAC</span>
          </a>
          <span style={{ color: 'var(--border-strong, var(--border))', fontSize: 14 }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>文档</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="docs-mobile-toggle"
            onClick={() => setMobileNavOpen(v => !v)}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', display: 'none' }}
          >
            {mobileNavOpen ? '关闭目录' : '目录'}
          </button>
          <a href="/" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            首页
          </a>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .docs-mobile-toggle { display: block !important; }
          .docs-sidebar { display: none !important; }
          .docs-sidebar.open { display: block !important; position: fixed; inset: 52px 0 0; z-index: 90; background: var(--bg); overflow-y: auto; padding: 16px; border-right: none !important; }
        }
      `}</style>

      <div style={{ display: 'flex', maxWidth: 1100, margin: '0 auto', minHeight: 'calc(100vh - 52px)' }}>

        <div className={`docs-sidebar${mobileNavOpen ? ' open' : ''}`} style={{
          width: 220, flexShrink: 0, borderRight: '1px solid var(--border)',
          padding: '24px 0', position: 'sticky', top: 52, height: 'calc(100vh - 52px)', overflowY: 'auto',
        }}>
          {CHAPTERS.map(ch => (
            <div key={ch.id} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', padding: '0 20px', marginBottom: 4, textTransform: 'uppercase' }}>
                {ch.title}
              </div>
              {ch.sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '6px 20px', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: activeId === s.id ? 600 : 400,
                    color: activeId === s.id ? 'var(--primary)' : 'var(--text-muted)',
                    background: activeId === s.id ? 'var(--primary-light)' : 'transparent',
                    borderLeft: activeId === s.id ? '2px solid var(--primary)' : '2px solid transparent',
                    transition: 'all .1s',
                  }}
                >
                  {s.title}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div ref={contentRef} style={{ flex: 1, padding: 'clamp(24px,4vw,48px) clamp(20px,5vw,56px)', maxWidth: 720, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
            {CHAPTERS.find(c => c.sections.some(s => s.id === activeId))?.title}
          </div>
          <H2>{activeSection.title}</H2>
          <div style={{ marginTop: 16 }}>
            {activeSection.content}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
            {prevSection && (
              <button onClick={() => scrollTo(prevSection.id)} style={{
                flex: 1, padding: '12px 16px', borderRadius: 9, border: '1px solid var(--border)',
                background: 'var(--bg-card)', cursor: 'pointer', textAlign: 'left',
                fontSize: 12, color: 'var(--text-muted)',
              }}>
                <div style={{ marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg> 上一篇</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{prevSection.title}</div>
              </button>
            )}
            {nextSection && (
              <button onClick={() => scrollTo(nextSection.id)} style={{
                flex: 1, padding: '12px 16px', borderRadius: 9, border: '1px solid var(--border)',
                background: 'var(--bg-card)', cursor: 'pointer', textAlign: 'right',
                fontSize: 12, color: 'var(--text-muted)',
              }}>
                <div style={{ marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>下一篇 <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{nextSection.title}</div>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
