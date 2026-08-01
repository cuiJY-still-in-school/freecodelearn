export interface ToolDef {
  name: string
  description: string
  input_schema: { type: 'object'; properties: Record<string, any>; required?: string[] }
  execute(params: Record<string, any>, ctx: ToolContext): Promise<string>
}

export interface ToolContext {
  userId: string
  studentId: string
}

const registry: Map<string, ToolDef> = new Map()

export function registerTool(tool: ToolDef): void {
  registry.set(tool.name, tool)
}

export function getTool(name: string): ToolDef | undefined {
  return registry.get(name)
}

export function getAllTools(): ToolDef[] {
  return Array.from(registry.values())
}

export function toOpenAITools(): any[] {
  return getAllTools().map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }))
}
