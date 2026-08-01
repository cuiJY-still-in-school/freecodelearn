import { registerTool } from './index'
import { getSetting } from '../services/settings.service'

interface SearchResult {
  title: string
  snippet: string
  url: string
}

async function serperSearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: 'cn', hl: 'zh-cn', num: 6 }),
    signal: AbortSignal.timeout(8000)
  })
  if (!res.ok) throw new Error(`Serper ${res.status}`)
  const data = await res.json() as {
    organic?: Array<{ title: string; snippet: string; link: string }>
    answerBox?: { answer?: string; title?: string }
  }
  const out: SearchResult[] = []
  if (data.answerBox?.answer) {
    out.push({ title: data.answerBox.title || '直接答案', snippet: data.answerBox.answer, url: '' })
  }
  for (const r of (data.organic || []).slice(0, 5)) {
    out.push({ title: r.title, snippet: r.snippet || '', url: r.link })
  }
  return out
}

async function wikiSearch(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = []

  // 中文 Wikipedia 搜索
  const searchUrl = `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&origin=*`
  const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(6000) })
  if (!searchRes.ok) return results

  const data = await searchRes.json() as {
    query?: { search?: Array<{ title: string; snippet: string }> }
  }
  const hits = data.query?.search || []
  if (hits.length === 0) return results

  // 取第一条的完整摘要
  const topTitle = encodeURIComponent(hits[0].title)
  try {
    const summaryRes = await fetch(
      `https://zh.wikipedia.org/api/rest_v1/page/summary/${topTitle}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (summaryRes.ok) {
      const s = await summaryRes.json() as { title: string; extract?: string; content_urls?: { desktop?: { page?: string } } }
      results.push({
        title: s.title,
        snippet: s.extract?.slice(0, 800) || '',
        url: s.content_urls?.desktop?.page || `https://zh.wikipedia.org/wiki/${topTitle}`
      })
    }
  } catch { /* fallback to snippet */ }

  // 剩余条目用 snippet
  for (const h of hits.slice(results.length > 0 ? 1 : 0, 4)) {
    const clean = h.snippet.replace(/<[^>]+>/g, '')
    results.push({
      title: h.title,
      snippet: clean,
      url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(h.title)}`
    })
  }
  return results
}

registerTool({
  name: 'web_search',
  description: '在网络上搜索信息，用于查找题目解析、学科知识、概念解释、历史事实、实时信息等。遇到不确定的知识点、需要引用资料或学生提出疑问时主动调用。',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词，建议用中文，可以是问题或关键词' }
    },
    required: ['query']
  },
  async execute(params) {
    const query = params.query as string
    if (!query?.trim()) return '请提供搜索关键词'

    let results: SearchResult[] = []
    let source = ''

    // 优先用 Serper（如果配置了 API Key）
    try {
      const row = getSetting('serper_api_key')
      if (row?.value) {
        const key = row.value
        results = await serperSearch(query, key)
        source = 'Google (Serper)'
      }
    } catch (e) {
      console.warn('[search] Serper failed:', e)
    }

    // Fallback: 中文维基百科
    if (results.length === 0) {
      try {
        results = await wikiSearch(query)
        source = '中文维基百科'
      } catch (e) {
        console.warn('[search] Wikipedia failed:', e)
      }
    }

    if (results.length === 0) return `未找到关于"${query}"的搜索结果。`

    const lines = [`【搜索结果】来源：${source}，查询："${query}"\n`]
    for (const r of results) {
      lines.push(`**${r.title}**`)
      if (r.snippet) lines.push(r.snippet)
      if (r.url) lines.push(`链接：${r.url}`)
      lines.push('')
    }
    return lines.join('\n')
  }
})
