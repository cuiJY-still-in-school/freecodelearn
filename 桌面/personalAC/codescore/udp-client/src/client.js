#!/usr/bin/env node
// PAC UDP Client v1.0
// Usage: node src/client.js [host] [port]
// Default: localhost 7823

import dgram from 'dgram'
import readline from 'readline'
import chalk from 'chalk'
import { PacketType, encodePacket, decodePacket } from './protocol.js'

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

const state = {
  host: process.argv[2] || 'localhost',
  port: parseInt(process.argv[3], 10) || 7823,
  sessionId: null,
  connected: false,
  seqNum: 0,
  pendingAcks: new Map(),   // seqNum → { resolve, reject, timer }
  heartbeatTimer: null,
  heartbeatMissed: 0,
  pingStartTime: 0,
  startTime: Date.now(),
}

const ACK_TIMEOUT_MS = 3_000
const ACK_MAX_RETRIES = 2
const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_MAX_MISSED = 3

// ─────────────────────────────────────────────
// UDP socket
// ─────────────────────────────────────────────

const socket = dgram.createSocket('udp4')

function send(type, payload) {
  state.seqNum++
  const seqNum = state.seqNum
  const buf = encodePacket(type, seqNum, payload)
  socket.send(buf, state.port, state.host, (err) => {
    if (err) printError(`Send error: ${err.message}`)
  })
  return seqNum
}

/**
 * Send a MSG packet and wait for ACK (with retry).
 * @param {string} text
 * @returns {Promise<void>}
 */
function sendMsgWithAck(text) {
  return new Promise((resolve, reject) => {
    let attempts = 0

    const attempt = () => {
      attempts++
      const seqNum = send(PacketType.MSG, { text })
      const timer = setTimeout(() => {
        state.pendingAcks.delete(seqNum)
        if (attempts <= ACK_MAX_RETRIES) {
          printSystem(`消息未确认，重试 (${attempts}/${ACK_MAX_RETRIES})...`)
          attempt()
        } else {
          reject(new Error('消息发送超时，未收到确认'))
        }
      }, ACK_TIMEOUT_MS)

      state.pendingAcks.set(seqNum, { resolve, timer })
    }

    attempt()
  })
}

// ─────────────────────────────────────────────
// Readline interface
// ─────────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
})

function prompt() {
  if (state.connected) {
    process.stdout.write(chalk.white('You> '))
  }
}

// ─────────────────────────────────────────────
// Print helpers
// ─────────────────────────────────────────────

function clearLine() {
  if (process.stdout.isTTY) {
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
  }
}

function printAgent(text) {
  clearLine()
  console.log(chalk.cyan('[Agent] ') + text)
  prompt()
}

function printSystem(text) {
  clearLine()
  console.log(chalk.yellow('[System] ') + text)
  prompt()
}

function printError(text) {
  clearLine()
  console.log(chalk.red('[Error] ') + text)
  prompt()
}

function printPong(delayMs) {
  clearLine()
  console.log(chalk.gray(`Pong! ${delayMs}ms`))
  prompt()
}

// ─────────────────────────────────────────────
// Heartbeat
// ─────────────────────────────────────────────

function startHeartbeat() {
  stopHeartbeat()
  state.heartbeatMissed = 0
  state.heartbeatTimer = setInterval(() => {
    if (!state.connected) return
    state.heartbeatMissed++
    if (state.heartbeatMissed >= HEARTBEAT_MAX_MISSED) {
      printSystem('连接可能已断开（心跳超时），请尝试重新启动客户端。')
      stopHeartbeat()
      return
    }
    state.pingStartTime = Date.now()
    send(PacketType.PING, {})
  }, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeat() {
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer)
    state.heartbeatTimer = null
  }
}

// ─────────────────────────────────────────────
// Packet handler
// ─────────────────────────────────────────────

socket.on('message', (buf) => {
  const packet = decodePacket(buf)
  if (!packet) {
    printError('收到无效数据包（Magic 或 CRC 校验失败）')
    return
  }

  switch (packet.type) {
    case PacketType.WELCOME: {
      state.sessionId = packet.payload.sessionId
      state.connected = true
      clearLine()
      console.log(chalk.green(`✓ Connected to ${state.host}:${state.port}`))
      if (packet.payload.motd) {
        console.log(chalk.yellow('[System] ') + packet.payload.motd)
      }
      console.log(chalk.gray(`  Session ID: ${state.sessionId}`))
      console.log(chalk.gray('  输入消息与 Agent 对话，或 /help 查看命令。'))
      startHeartbeat()
      prompt()
      break
    }

    case PacketType.MSG: {
      const text = packet.payload.text || ''
      // Send ACK for incoming message
      send(PacketType.ACK, { ackSeq: packet.seqNum })
      printAgent(text)
      break
    }

    case PacketType.ACK: {
      const ackSeq = packet.payload.ackSeq
      const pending = state.pendingAcks.get(ackSeq)
      if (pending) {
        clearTimeout(pending.timer)
        state.pendingAcks.delete(ackSeq)
        pending.resolve()
      }
      break
    }

    case PacketType.PONG: {
      state.heartbeatMissed = 0
      // If we tracked ping start time (from /ping command)
      if (state.pingStartTime > 0) {
        const delay = Date.now() - state.pingStartTime
        printPong(delay)
        state.pingStartTime = 0
      } else {
        // heartbeat pong
        state.heartbeatMissed = 0
      }
      break
    }

    case PacketType.CMD_RESP: {
      const cmd = packet.payload.cmd || ''
      const result = packet.payload.result || ''
      clearLine()
      console.log(chalk.yellow(`[${cmd}]`) + '\n' + result)
      prompt()
      break
    }

    case PacketType.ERROR: {
      const code = packet.payload.code || 0
      const message = packet.payload.message || '未知错误'
      printError(`服务端错误 (code=${code}): ${message}`)
      break
    }

    case PacketType.BYE: {
      const reason = packet.payload.reason || '服务端断开连接'
      state.connected = false
      stopHeartbeat()
      printSystem(`连接已断开: ${reason}`)
      gracefulExit()
      break
    }

    default:
      // Unknown packet type – ignore silently
      break
  }
})

socket.on('error', (err) => {
  printError(`Socket 错误: ${err.message}`)
})

// ─────────────────────────────────────────────
// Command handlers
// ─────────────────────────────────────────────

async function handleCommand(input) {
  const trimmed = input.trim()
  const [cmdRaw, ...args] = trimmed.split(/\s+/)
  const cmd = cmdRaw.toLowerCase()

  switch (cmd) {
    case '/help':
      clearLine()
      console.log(
        chalk.yellow('[Help]') + '\n' +
        '  /help      — 显示此帮助\n' +
        '  /status    — 查看 Bot 运行状态\n' +
        '  /plan      — 查看当前学习方向\n' +
        '  /weakness  — 查看薄弱知识点 Top 5\n' +
        '  /ping      — 测试连接延迟\n' +
        '  /quit      — 断开连接并退出\n' +
        '  /exit      — 同 /quit\n' +
        '  （其他文字直接发送给 Agent）'
      )
      prompt()
      break

    case '/status':
      if (!state.connected) { printError('未连接，请等待 HELLO/WELCOME 握手完成'); break }
      send(PacketType.CMD, { cmd: 'status', args })
      break

    case '/plan':
      if (!state.connected) { printError('未连接'); break }
      send(PacketType.CMD, { cmd: 'plan', args })
      break

    case '/weakness':
      if (!state.connected) { printError('未连接'); break }
      send(PacketType.CMD, { cmd: 'weakness', args })
      break

    case '/ping':
      if (!state.connected) { printError('未连接'); break }
      state.pingStartTime = Date.now()
      send(PacketType.PING, {})
      break

    case '/quit':
    case '/exit':
      if (state.connected) {
        send(PacketType.BYE, { reason: '客户端主动退出' })
      }
      stopHeartbeat()
      printSystem('再见！')
      gracefulExit()
      break

    default:
      printError(`未知命令: ${cmdRaw}。输入 /help 查看可用命令。`)
      prompt()
  }
}

// ─────────────────────────────────────────────
// Input loop
// ─────────────────────────────────────────────

rl.on('line', async (line) => {
  const trimmed = line.trim()
  if (!trimmed) {
    prompt()
    return
  }

  if (trimmed.startsWith('/')) {
    await handleCommand(trimmed)
    return
  }

  // Regular message → send to Agent
  if (!state.connected) {
    printError('尚未连接到服务器，请等待 WELCOME 响应。')
    return
  }

  try {
    await sendMsgWithAck(trimmed)
    // Message ACK received; Agent reply will arrive as separate MSG packet
  } catch (err) {
    printError(err.message)
    prompt()
  }
})

rl.on('close', () => {
  stopHeartbeat()
  if (state.connected) {
    send(PacketType.BYE, { reason: '客户端关闭' })
  }
  process.exit(0)
})

// ─────────────────────────────────────────────
// Graceful exit
// ─────────────────────────────────────────────

function gracefulExit() {
  stopHeartbeat()
  // Clear all pending acks
  for (const [, pending] of state.pendingAcks) {
    clearTimeout(pending.timer)
  }
  state.pendingAcks.clear()
  setTimeout(() => {
    socket.close()
    rl.close()
    process.exit(0)
  }, 200)
}

process.on('SIGINT', () => {
  clearLine()
  printSystem('收到 Ctrl+C，正在退出...')
  if (state.connected) {
    send(PacketType.BYE, { reason: '客户端中断' })
  }
  gracefulExit()
})

// ─────────────────────────────────────────────
// Startup
// ─────────────────────────────────────────────

console.log(chalk.cyan(
  '╔══════════════════════════════════╗\n' +
  '║   PAC UDP Client v1.0            ║\n' +
  '║   PersonalAC Communication       ║\n' +
  '╚══════════════════════════════════╝'
))
console.log(chalk.gray(`Connecting to ${state.host}:${state.port}...`))

// Bind first, then send HELLO
socket.bind(() => {
  send(PacketType.HELLO, { version: '1', name: 'PAC-CLI' })
})
