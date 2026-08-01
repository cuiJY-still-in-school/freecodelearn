import { buildCompanionSystemPrompt } from './system-prompt'
import { getOrCreateBoard, getBlocks } from '../services/board.service'
import { getAIConfig } from '../services/settings.service'
import { setCompanionState } from '../services/companion.service'
import { listCommandsForStudent, acknowledgeCommand, incrementExecuted } from '../services/guardian.service'
import { getAllTools, toOpenAITools, getTool, ToolContext } from '../tools'
import axios from 'axios'
import '../tools/board-tools'

export class AgentEngine {
  // VL 流式对话（支持白板截图）
  async streamChatVL(
    studentId: string, userId: string,
    messages: Array<{ role: string; content: string }>,
    mode: 'study' | 'homework',
    canvasImage: string | null,
    callbacks: {
      onToken: (t: string) => void
      onBoardAction: (a: any) => void
      onCompanion: (s: string) => void
      onError: (e: string) => void
    }
  ): Promise<void> {
    const aiConfig = getAIConfig()
    if (!aiConfig) { callbacks.onError('请先配置 AI'); return }

    const model = aiConfig.modelId
    const systemPrompt = buildCompanionSystemPrompt(studentId, mode)
    const toolCtx: ToolContext = { userId, studentId }
    const tools = toOpenAITools()

    // 构建消息列表
    const apiMessages: any[] = [{ role: 'system', content: systemPrompt }]
    for (const msg of messages) {
      apiMessages.push({ role: msg.role, content: msg.content })
    }

    // 最后一条用户消息如果有白板截图，转换为 vision 格式
    const lastIdx = apiMessages.length - 1
    if (canvasImage && lastIdx >= 0 && apiMessages[lastIdx].role === 'user') {
      const userText = apiMessages[lastIdx].content
      apiMessages[lastIdx] = {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: canvasImage } },
          { type: 'text', text: userText || '看看白板上写了什么？' },
        ],
      }
    }

    setCompanionState(studentId, 'thinking')
    callbacks.onCompanion('thinking')

    try {
      let currentMessages = [...apiMessages]
      let maxRounds = 3

      while (maxRounds-- > 0) {
        const response = await axios.post(
          `${aiConfig.baseUrl || 'https://api.minimaxi.com'}/v1/chat/completions`,
          { model, messages: currentMessages, tools, tool_choice: 'auto', stream: true, max_tokens: 4096 },
          {
            headers: {
              Authorization: `Bearer ${aiConfig.apiKey}`,
              'Content-Type': 'application/json',
            },
            responseType: 'stream',
            timeout: 120000,
          }
        )

        const stream = response.data
        let buffer = ''
        let toolCalls: any[] = []
        let hasToolCalls = false
        let hasContent = false

        await new Promise<void>((resolve, reject) => {
          stream.on('data', (chunk: Buffer) => {
            buffer += chunk.toString()
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            for (const line of lines) {
              if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
              try {
                const json = JSON.parse(line.slice(6))
                const delta = json.choices?.[0]?.delta
                if (delta?.tool_calls) {
                  hasToolCalls = true
                  for (const tc of delta.tool_calls) {
                    if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: tc.id || '', name: '', arguments: '' }
                    if (tc.id) toolCalls[tc.index].id = tc.id
                    if (tc.function?.name) toolCalls[tc.index].name += tc.function.name
                    if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments
                  }
                }
                if (delta?.content) {
                  hasContent = true
                  callbacks.onToken(delta.content)
                }
              } catch (_) {}
            }
          })
          stream.on('end', resolve)
          stream.on('error', reject)
        })

        if (hasToolCalls && toolCalls.length > 0) {
          setCompanionState(studentId, 'writing')
          callbacks.onCompanion('writing')

          const assistantMsg: any = { role: 'assistant', content: null, tool_calls: [] }
          for (const tc of toolCalls.filter(Boolean)) {
            assistantMsg.tool_calls.push({
              id: tc.id, type: 'function',
              function: { name: tc.name, arguments: tc.arguments },
            })
            const tool = getTool(tc.name)
            if (tool) {
              try {
                const args = JSON.parse(tc.arguments || '{}')
                const result = await tool.execute(args, toolCtx)

                // 如果是白板操作，解析结果并通知前端
                try {
                  const parsed = JSON.parse(result)
                  if (parsed.board_action) {
                    callbacks.onBoardAction({
                      type: parsed.board_action,
                      x: parsed.x, y: parsed.y,
                      text: parsed.text,
                      w: parsed.w, h: parsed.h,
                      color: parsed.color, note: parsed.note,
                      width: parsed.width,
                    })
                  }
                } catch (_) {}

                currentMessages.push(assistantMsg)
                currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: result })
              } catch (err: any) {
                console.error(`Tool ${tc.name} error:`, err.message)
              }
            }
          }
          if (!hasContent) continue
        }

        break
      }

      // Ack guardian commands
      const commands = listCommandsForStudent(studentId)
      for (const cmd of commands) {
        if (!cmd.acknowledged) { acknowledgeCommand(cmd.id); incrementExecuted(cmd.id) }
      }

      setCompanionState(studentId, 'watching')
      callbacks.onCompanion('watching')
    } catch (err: any) {
      console.error('Agent VL error:', err.message)
      callbacks.onError(err.message || 'AI 服务异常')
    }
  }
}
