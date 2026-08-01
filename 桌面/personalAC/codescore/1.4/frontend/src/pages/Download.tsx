import React, { useEffect, useRef, useState } from 'react'

const tok = () => localStorage.getItem('syncToken') || ''

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent)
}

interface PlatformInfo {
  available: boolean
  filename: string
  size: number
  url: string | null
  version: string | null
}

interface DownloadInfo {
  windows: PlatformInfo
  linux: PlatformInfo
  mac: PlatformInfo
  android: PlatformInfo
}

function fmtSize(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', marginTop: 12,
    }}>
      <code style={{ flex: 1, fontSize: 12, color: 'var(--text)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
        {code}
      </code>
      <button
        onClick={copy}
        style={{
          flexShrink: 0, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
          background: copied ? 'var(--primary-light)' : 'var(--card)', cursor: 'pointer',
          fontSize: 11, color: copied ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600,
        }}
      >
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  )
}

function PlatformCard({
  icon, title, subtitle, info, downloadUrl, downloadLabel,
  uploadLabel, uploadAccept, uploadNote, platform, onUploaded, installCmd,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  info: PlatformInfo | null
  downloadUrl: string
  downloadLabel: string
  uploadLabel: string
  uploadAccept: string
  uploadNote?: string
  platform: 'windows' | 'linux' | 'mac' | 'android'
  onUploaded: () => void
  installCmd?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    setUploading(true); setUploadMsg('')
    const CHUNK = 10 * 1024 * 1024
    const total = Math.max(1, Math.ceil(file.size / CHUNK))
    try {
      for (let i = 0; i < total; i++) {
        const chunk = file.slice(i * CHUNK, (i + 1) * CHUNK)
        const res = await fetch(
          `/download/upload-chunk?platform=${platform}&chunk=${i}&total=${total}&version=manual`,
          {
            method: 'POST',
            headers: { 'x-sync-token': tok(), 'Content-Type': 'application/octet-stream' },
            body: chunk,
          }
        ).then(r => r.json())
        if (!res.success) { setUploadMsg(res.error || '上传失败'); return }
        setUploadMsg(`上传中 ${i + 1}/${total}…`)
      }
      setUploadMsg('上传成功')
      onUploaded()
    } catch {
      setUploadMsg('网络错误')
    } finally {
      setUploading(false)
    }
  }

  const loading = info === null
  const available = info?.available ?? false

  return (
    <div className="card" style={{ maxWidth: 520, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
          background: 'var(--primary-light)', border: '1px solid var(--primary-ring)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 2 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {loading ? '加载中…' : available
              ? `${info!.filename}  ·  ${fmtSize(info!.size)}${info!.version ? `  ·  v${info!.version}` : ''}`
              : subtitle}
          </div>
        </div>
      </div>

      {installCmd ? (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            {available ? '一键安装（推荐）：' : '服务器暂无此平台文件，上传后可用此命令安装：'}
          </div>
          <CopyableCode code={installCmd} />
          {available && (
            <div style={{ marginTop: 10 }}>
              <a href={downloadUrl} download
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontSize: 12 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                直接下载二进制 ({fmtSize(info?.size ?? 0)})
              </a>
            </div>
          )}
          {uploadNote && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
              {uploadNote}
            </div>
          )}
        </div>
      ) : available ? (
        <div>
          <a href={downloadUrl} download
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {downloadLabel} ({fmtSize(info!.size)})
          </a>
          {uploadNote && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
              {uploadNote}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)' }}>
          客户端尚未发布，通过下方上传功能发布。
        </div>
      )}

      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>管理员上传</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input ref={fileRef} type="file" accept={uploadAccept} style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}
            disabled={uploading} style={{ fontSize: 12 }}>
            {uploading ? uploadMsg : uploadLabel}
          </button>
          {!uploading && uploadMsg && (
            <span style={{ fontSize: 12, color: uploadMsg === '上传成功' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
              {uploadMsg}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const winIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--primary)">
    <path d="M3 5.5L11 4.3V11.5H3V5.5ZM3 12.5H11V19.7L3 18.5V12.5ZM12 4.1L21 2.8V11.5H12V4.1ZM12 12.5H21V21.2L12 19.9V12.5Z"/>
  </svg>
)
const linuxIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--primary)">
    <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489.117.779.567 1.563 1.405 1.985 1.503.771 2.719.258 3.752-.428.993-.661 1.8-1.662 2.6-2.531.797-.866 1.58-1.553 2.312-1.899.447-.215.884-.298 1.32-.257 1.394.15 2.56 1.467 3.225 2.614.606 1.056 1.083 2.257 1.254 3.387.243 1.563-.2 3.069-1.228 4.128-.676.695-1.526 1.101-2.454 1.236-1.15.169-2.376-.11-3.49-.814-1.232-.782-2.132-1.977-2.498-3.296-.334-1.216-.12-2.584.63-3.817.733-1.207 1.964-2.187 3.544-2.614 1.01-.272 2.099-.334 3.165-.163.27.043.541.099.808.166.27.066.53.158.775.268.251.113.482.247.694.4.22.157.42.335.598.531.364.393.63.856.8 1.353.336 1.003.288 2.133-.116 3.022-.41.9-1.152 1.622-2.152 2.062-.97.428-2.09.578-3.21.42-1.178-.167-2.296-.663-3.16-1.395-.83-.706-1.41-1.64-1.614-2.668-.199-1.017.017-2.12.594-3.07.565-.929 1.48-1.686 2.64-2.128.543-.207 1.128-.334 1.74-.362.298-.013.6-.004.9.027.147.016.294.038.44.069.147.03.291.07.43.12.282.095.547.225.79.385.235.156.447.343.634.556.366.425.606.944.694 1.503.17 1.056-.221 2.165-.993 2.956-.747.765-1.804 1.253-2.98 1.346-1.182.095-2.37-.203-3.33-.826-.942-.611-1.662-1.531-1.974-2.621-.305-1.077-.173-2.279.36-3.315.525-1.02 1.4-1.874 2.5-2.42.51-.254 1.056-.435 1.63-.53.57-.094 1.165-.105 1.758-.03.59.074 1.172.226 1.72.453 1.08.44 2.023 1.17 2.7 2.118.667.938 1.03 2.056.997 3.19-.03 1.116-.418 2.2-1.105 3.12-.676.904-1.65 1.64-2.804 2.103-1.15.46-2.47.63-3.773.48-1.302-.148-2.57-.6-3.656-1.3-1.082-.697-1.99-1.657-2.567-2.777-.573-1.116-.79-2.38-.587-3.616.2-1.22.77-2.382 1.635-3.357.86-.967 1.998-1.73 3.28-2.19 1.27-.456 2.66-.595 3.99-.396 1.328.198 2.614.718 3.69 1.504.529.392 1 .855 1.393 1.376.4.53.705 1.12.9 1.745.4 1.252.338 2.625-.138 3.876-.47 1.24-1.312 2.32-2.426 3.12C15.02 20.73 13.638 21.2 12.2 21.2c-1.43 0-2.818-.472-3.93-1.32-1.096-.836-1.898-2.01-2.247-3.33-.344-1.307-.218-2.736.352-3.994.559-1.243 1.49-2.28 2.65-2.977 1.14-.684 2.478-1.01 3.83-.93z"/>
  </svg>
)
const macIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--primary)">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
)
const androidIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--primary)">
    <path d="M17.523 15.341a.88.88 0 0 1-.88.879.88.88 0 0 1-.879-.879.88.88 0 0 1 .879-.879.88.88 0 0 1 .88.879zm-10.166 0a.88.88 0 0 1-.879.879.88.88 0 0 1-.879-.879.88.88 0 0 1 .879-.879.88.88 0 0 1 .879.879zm10.556-5.623l1.757-3.044a.368.368 0 0 0-.134-.502.368.368 0 0 0-.502.134l-1.779 3.08a10.61 10.61 0 0 0-4.255-.878c-1.523 0-2.97.32-4.254.878L7.066 6.306a.368.368 0 0 0-.502-.134.368.368 0 0 0-.134.502l1.757 3.044C5.963 11.06 4.682 13.3 4.682 15.83h14.636c0-2.53-1.281-4.77-3.405-6.112z"/>
  </svg>
)

export default function Download(): React.ReactElement {
  const [info, setInfo] = useState<DownloadInfo | null>(null)
  const onAndroid = isAndroid()

  const serverOrigin = window.location.origin

  function loadInfo() {
    fetch('/download/info')
      .then(r => r.json())
      .then(d => setInfo(d))
      .catch(() => {})
  }

  useEffect(() => { loadInfo() }, [])

  return (
    <div className="page-enter">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.035em', color: 'var(--text)', marginBottom: 4 }}>
          客户端下载
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          学生端桌面 / 移动客户端，用于学习监管与行为记录
        </p>
      </div>

      {/* Android 用户优先提示 */}
      {onAndroid && (
        <div style={{
          marginBottom: 24, padding: '14px 18px', borderRadius: 10,
          background: 'var(--primary-light)', border: '1px solid var(--primary-ring)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {androidIcon}
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>检测到 Android 设备</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>请下载 Android 版 App，体验更流畅</div>
          </div>
        </div>
      )}

      {/* Android */}
      <PlatformCard
        icon={androidIcon}
        title="PersonalAC for Android"
        subtitle="APK 尚未发布"
        info={info?.android ?? null}
        downloadUrl="/download/android"
        downloadLabel="下载 Android APK"
        uploadLabel="上传 .apk"
        uploadAccept=".apk"
        uploadNote="下载后打开 APK 直接安装（需允许「未知来源」）"
        platform="android"
        onUploaded={loadInfo}
      />

      {/* Windows / Linux / Mac */}
      {!onAndroid && (
        <>
          <PlatformCard
            icon={winIcon}
            title="PersonalAC for Windows"
            subtitle="客户端文件尚未发布"
            info={info?.windows ?? null}
            downloadUrl="/download/windows"
            downloadLabel="下载 Windows 客户端"
            uploadLabel="上传 .exe"
            uploadAccept=".exe"
            uploadNote="下载 .exe 后直接双击运行，无需安装"
            platform="windows"
            onUploaded={loadInfo}
          />

          <PlatformCard
            icon={linuxIcon}
            title="PersonalAC for Linux"
            subtitle="客户端文件尚未发布"
            info={info?.linux ?? null}
            downloadUrl="/download/linux-bin"
            downloadLabel="下载 Linux 二进制"
            uploadLabel="上传 Linux 二进制"
            uploadAccept="*"
            uploadNote="支持 x86_64 Linux，下载后 chmod +x 运行"
            platform="linux"
            onUploaded={loadInfo}
            installCmd={`curl -fsSL ${serverOrigin}/download/install.sh | sh`}
          />

          <PlatformCard
            icon={macIcon}
            title="PersonalAC for macOS"
            subtitle="客户端文件尚未发布"
            info={info?.mac ?? null}
            downloadUrl="/download/mac-bin"
            downloadLabel="下载 macOS 二进制"
            uploadLabel="上传 macOS 二进制"
            uploadAccept="*"
            uploadNote="支持 Apple Silicon 和 Intel Mac"
            platform="mac"
            onUploaded={loadInfo}
            installCmd={`curl -fsSL ${serverOrigin}/download/install.sh | sh`}
          />
        </>
      )}

      {/* 安装步骤 */}
      <div className="card" style={{ maxWidth: 520 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>安装步骤</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Android</div>
            <ol style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {['下载 APK 文件', '打开文件管理器安装（需允许「未知来源」）', '首次启动输入服务器地址', '使用邀请链接或账号密码登录'].map((s, i) => (
                <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 600, color: 'var(--primary)', marginRight: 4 }}>{i + 1}.</span>{s}
                </li>
              ))}
            </ol>
          </div>

          {!onAndroid && (
            <>
              <div style={{ height: 1, background: 'var(--border)' }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Windows</div>
                <ol style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {['下载 personalac-student.exe', '直接双击运行，无需安装', '首次启动粘贴邀请链接', '设置登录密码，账号激活'].map((s, i) => (
                    <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      <span style={{ fontWeight: 600, color: 'var(--primary)', marginRight: 4 }}>{i + 1}.</span>{s}
                    </li>
                  ))}
                </ol>
              </div>

              <div style={{ height: 1, background: 'var(--border)' }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Linux / macOS</div>
                <ol style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    '在终端运行上方 install.sh 一键安装命令',
                    '脚本自动下载对应平台二进制并配置开机自启',
                    '首次启动粘贴邀请链接',
                    '设置登录密码，账号激活',
                  ].map((s, i) => (
                    <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      <span style={{ fontWeight: 600, color: 'var(--primary)', marginRight: 4 }}>{i + 1}.</span>{s}
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'var(--primary-light)', border: '1px solid var(--primary-ring)', fontSize: 12, color: 'var(--text-secondary)' }}>
          确保学生设备与本服务器在同一局域网，或服务器已配置公网访问。
        </div>
      </div>
    </div>
  )
}
