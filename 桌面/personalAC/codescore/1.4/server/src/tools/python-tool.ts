import { spawnSync } from 'child_process'
import { registerTool } from './index'

// 允许的导入白名单（基础数学/科学库）
const SAFE_IMPORTS = new Set([
  'math', 'cmath', 'decimal', 'fractions', 'statistics',
  'random', 'itertools', 'functools', 'operator',
  'numpy', 'sympy', 'scipy', 'matplotlib', 'pandas',
  'json', 're', 'string', 'collections', 'heapq', 'bisect'
])

function checkSafe(code: string): string | null {
  const dangerous = [
    'import os', 'import sys', 'import subprocess', 'import socket',
    'import requests', 'import urllib', 'import http',
    '__import__', 'exec(', 'eval(', 'open(', 'file(',
    'os.', 'sys.', 'subprocess.', '__builtins__'
  ]
  for (const d of dangerous) {
    if (code.includes(d)) return `代码包含不允许的操作: ${d}`
  }
  return null
}

registerTool({
  name: 'run_python',
  description: '执行 Python 代码进行数学计算、方程求解、数据分析、统计等。结果通过 print() 输出。支持 math、sympy、numpy、statistics 等库。禁止文件、网络、系统操作。',
  input_schema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: '要执行的 Python 代码，用 print() 输出结果' }
    },
    required: ['code']
  },
  async execute(params) {
    const code = params.code as string
    if (!code?.trim()) return '代码不能为空'

    const safeErr = checkSafe(code)
    if (safeErr) return `安全检查失败：${safeErr}`

    const result = spawnSync('python3', ['-c', code], {
      timeout: 8000,
      encoding: 'utf8',
      maxBuffer: 512 * 1024,
      env: { PATH: process.env.PATH || '/usr/bin:/usr/local/bin' }
    })

    if (result.error) {
      if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
        return '服务器未安装 Python3，无法执行代码。'
      }
      if (result.error.message.includes('ETIMEDOUT') || result.signal === 'SIGTERM') {
        return '执行超时（8秒限制），请简化代码或减少计算量。'
      }
      return `执行错误: ${result.error.message}`
    }

    const stdout = result.stdout?.trim() || ''
    const stderr = result.stderr?.trim() || ''

    if (result.status !== 0) {
      const errLine = stderr.split('\n').pop() || stderr
      return `Python 错误:\n${errLine}`
    }

    if (!stdout) return '代码执行完成，无输出。（请用 print() 打印结果）'
    return `\`\`\`\n${stdout}\n\`\`\``
  }
})
