import { createWorker } from 'tesseract.js'
import path from 'path'
import os from 'os'

let workerReady: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null

function getWorker() {
  if (!workerReady) {
    workerReady = createWorker(['chi_sim', 'eng'], 1, {
      cachePath: path.join(os.homedir(), '.personalac', 'tessdata'),
      logger: () => {},
    })
  }
  return workerReady
}

export async function ocrBase64(base64: string, mediaType = 'image/jpeg'): Promise<string> {
  const buf = Buffer.from(base64, 'base64')
  const worker = await getWorker()
  const { data } = await worker.recognize(buf)
  return data.text.trim()
}
