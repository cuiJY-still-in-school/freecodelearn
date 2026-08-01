// PAC Protocol v1
// Packet format (Big-Endian binary):
//   [4 bytes] Magic: 0x50414301 ('PAC\x01')
//   [1 byte]  PacketType
//   [4 bytes] SeqNum (uint32 BE)
//   [2 bytes] PayloadLen (uint16 BE)
//   [N bytes] Payload (JSON UTF-8)
//   [2 bytes] CRC16 (CRC-CCITT, covers Magic+Type+SeqNum+PayloadLen+Payload)
//
// Total header: 11 bytes + payload + 2 bytes CRC
// Max packet size: 65507 bytes (UDP limit)

export const PacketType = Object.freeze({
  HELLO:    0x01,  // client→server: { version: '1', name?: string }
  WELCOME:  0x02,  // server→client: { sessionId: string, motd?: string }
  MSG:      0x03,  // bidirectional: { text: string, replyTo?: number }
  ACK:      0x04,  // bidirectional: { ackSeq: number }
  PING:     0x05,  // client→server: {}
  PONG:     0x06,  // server→client: { ts: number }
  BYE:      0x07,  // bidirectional: { reason?: string }
  ERROR:    0x08,  // server→client: { code: number, message: string }
  CMD:      0x09,  // client→server: { cmd: string, args?: string[] }
  CMD_RESP: 0x0A,  // server→client: { cmd: string, result: string }
})

// Reverse map for debugging
export const PacketTypeName = Object.freeze(
  Object.fromEntries(Object.entries(PacketType).map(([k, v]) => [v, k]))
)

const MAGIC = 0x50414301
const MAGIC_BUF = Buffer.from([0x50, 0x41, 0x43, 0x01])
const HEADER_SIZE = 11  // 4 magic + 1 type + 4 seqNum + 2 payloadLen
const CRC_SIZE = 2
const MAX_PACKET = 65507

/**
 * CRC-CCITT: polynomial 0x1021, initial value 0xFFFF
 * @param {Buffer} buf
 * @returns {number}
 */
export function crc16(buf) {
  let crc = 0xFFFF
  for (const byte of buf) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xFFFF
    }
  }
  return crc
}

/**
 * Encode a PAC packet into a Buffer.
 * @param {number} type - PacketType value
 * @param {number} seqNum - sequence number (uint32)
 * @param {object} payload - JSON-serialisable object
 * @returns {Buffer}
 */
export function encodePacket(type, seqNum, payload) {
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8')
  if (payloadBuf.length > MAX_PACKET - HEADER_SIZE - CRC_SIZE) {
    throw new Error(`PAC payload too large: ${payloadBuf.length} bytes`)
  }

  const total = HEADER_SIZE + payloadBuf.length + CRC_SIZE
  const buf = Buffer.allocUnsafe(total)

  // Magic (4 bytes)
  MAGIC_BUF.copy(buf, 0)
  // Type (1 byte)
  buf.writeUInt8(type, 4)
  // SeqNum (4 bytes BE)
  buf.writeUInt32BE(seqNum >>> 0, 5)
  // PayloadLen (2 bytes BE)
  buf.writeUInt16BE(payloadBuf.length, 9)
  // Payload
  payloadBuf.copy(buf, 11)

  // CRC over [Magic + Type + SeqNum + PayloadLen + Payload]
  const crcInput = buf.slice(0, HEADER_SIZE + payloadBuf.length)
  const checksum = crc16(crcInput)
  buf.writeUInt16BE(checksum, HEADER_SIZE + payloadBuf.length)

  return buf
}

/**
 * Decode a PAC packet from a Buffer. Validates Magic and CRC.
 * @param {Buffer} buf
 * @returns {{ type: number, seqNum: number, payload: object } | null}
 */
export function decodePacket(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < HEADER_SIZE + CRC_SIZE) return null

  // Verify magic
  if (buf.readUInt32BE(0) !== MAGIC) return null

  const type = buf.readUInt8(4)
  const seqNum = buf.readUInt32BE(5)
  const payloadLen = buf.readUInt16BE(9)

  if (buf.length < HEADER_SIZE + payloadLen + CRC_SIZE) return null

  // Verify CRC
  const crcInput = buf.slice(0, HEADER_SIZE + payloadLen)
  const expectedCrc = crc16(crcInput)
  const actualCrc = buf.readUInt16BE(HEADER_SIZE + payloadLen)
  if (expectedCrc !== actualCrc) {
    return null
  }

  let payload
  try {
    const payloadStr = buf.slice(HEADER_SIZE, HEADER_SIZE + payloadLen).toString('utf8')
    payload = JSON.parse(payloadStr)
  } catch {
    return null
  }

  return { type, seqNum, payload }
}
