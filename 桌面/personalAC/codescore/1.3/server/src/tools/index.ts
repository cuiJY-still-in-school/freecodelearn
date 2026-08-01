export interface ToolContext {
  userId: string     // 登录用户 ID
  studentId: string  // 操作数据所用的学生 ID（学生登录时 = userId，监护人登录时 = 其主学生 ID）
}

export interface ToolDef {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  execute(params: Record<string, unknown>, ctx: ToolContext): Promise<string>
}

const registry: ToolDef[] = []

export function registerTool(tool: ToolDef): void {
  registry.push(tool)
}

export function getTool(name: string): ToolDef | undefined {
  return registry.find(t => t.name === name)
}

export function toOpenAITools(): unknown[] {
  return registry.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema }
  }))
}

export function toAnthropicTools(): unknown[] {
  return registry.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema
  }))
}
