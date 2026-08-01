import React, { useEffect, useState } from 'react'
import { getAuth } from '../App'
import { resourceApi, type Resource, type ResourceListData } from '../api/ipc'

const SUBJECT_OPTIONS = [
  '全部', '数学', '语文', '英语', '物理', '化学', '生物',
  '历史', '地理', '政治', '计算机', '其他'
]

const FILE_TYPE_OPTIONS = ['全部', 'pdf', 'docx', 'doc', 'txt', 'md']

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN')
}

function Resources(): React.ReactElement {
  const auth = getAuth()
  const [resources, setResources] = useState<Resource[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Filters
  const [subject, setSubject] = useState('全部')
  const [fileType, setFileType] = useState('全部')
  const [page, setPage] = useState(1)
  const pageSize = 15

  // Upload form
  const [uploadSubject, setUploadSubject] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState('')

  const isTeacher = auth.role === 'teacher' || auth.role === 'admin'

  useEffect(() => {
    loadResources()
  }, [subject, fileType, page])

  const loadResources = async (): Promise<void> => {
    if (!auth.token) return
    setLoading(true)
    try {
      const result = await resourceApi.list(
        auth.token,
        subject !== '全部' ? subject : undefined,
        fileType !== '全部' ? fileType : undefined,
        page,
        pageSize
      )
      if (result.success && result.data) {
        const data = result.data as ResourceListData
        setResources(data.items)
        setTotal(data.total)
      } else {
        setError(result.error || '加载失败')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleOpenFileDialog = async (): Promise<void> => {
    const result = await resourceApi.openFileDialog()
    if (result.success && result.data) {
      const filePath = result.data as string
      setSelectedFile(filePath)
      const parts = filePath.split(/[/\\]/)
      setSelectedFileName(parts[parts.length - 1] || filePath)
    }
  }

  const handleUpload = async (): Promise<void> => {
    if (!selectedFile || !auth.token) {
      setError('请先选择文件')
      return
    }
    setError('')
    setSuccess('')
    setUploading(true)

    const parts = selectedFileName.split('.')
    const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'txt'

    try {
      const result = await resourceApi.upload(
        auth.token,
        selectedFile,
        selectedFileName,
        ext,
        uploadSubject || undefined
      )
      if (result.success) {
        setSuccess('文件上传成功')
        setSelectedFile(null)
        setSelectedFileName('')
        setUploadSubject('')
        setShowUpload(false)
        await loadResources()
      } else {
        setError(result.error || '上传失败')
      }
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string, fileName: string): Promise<void> => {
    if (!auth.token) return
    if (!confirm(`确定删除资源「${fileName}」吗？`)) return

    const result = await resourceApi.delete(auth.token, id)
    if (result.success) {
      setSuccess('删除成功')
      await loadResources()
    } else {
      setError(result.error || '删除失败')
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  const getFileIcon = (fileType: string): string => {
    const icons: Record<string, string> = {
      pdf: '📄',
      docx: '📝',
      doc: '📝',
      txt: '📃',
      md: '📓',
      ppt: '📊',
      pptx: '📊',
      xls: '📊',
      xlsx: '📊'
    }
    return icons[fileType.toLowerCase()] || '📁'
  }

  return (
    <div>
      <div
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div>
          <h1>学习资源</h1>
          <p>
            {isTeacher ? '管理和上传学习资料' : '浏览可用的学习材料'}（共 {total} 个文件）
          </p>
        </div>
        {isTeacher && (
          <button className="btn btn-primary" onClick={() => setShowUpload(!showUpload)}>
            {showUpload ? '取消' : '+ 上传资源'}
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Upload Panel */}
      {showUpload && isTeacher && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>上传学习资源</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
                选择文件
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-control"
                  readOnly
                  value={selectedFileName || '未选择文件'}
                  style={{ background: '#f9fafb', flex: 1, fontSize: 13 }}
                />
                <button className="btn btn-secondary" onClick={handleOpenFileDialog}>
                  浏览
                </button>
              </div>
            </div>
            <div style={{ flex: '0 1 160px' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
                科目（选填）
              </label>
              <select
                className="form-control"
                value={uploadSubject}
                onChange={(e) => setUploadSubject(e.target.value)}
              >
                <option value="">通用</option>
                {SUBJECT_OPTIONS.filter((s) => s !== '全部').map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
            >
              {uploading ? '上传中...' : '上传'}
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
            支持格式：PDF、Word (.docx/.doc)、纯文本 (.txt)、Markdown (.md)
          </p>
        </div>
      )}

      {/* Filters */}
      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: '12px 16px',
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'center'
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>科目：</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {SUBJECT_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSubject(s)
                  setPage(1)
                }}
                style={{
                  padding: '3px 10px',
                  borderRadius: 12,
                  border: `1px solid ${subject === s ? '#4f46e5' : '#e5e7eb'}`,
                  background: subject === s ? '#ede9fe' : 'white',
                  color: subject === s ? '#4f46e5' : '#6b7280',
                  cursor: 'pointer',
                  fontSize: 12
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>类型：</span>
          <select
            className="form-control"
            value={fileType}
            onChange={(e) => {
              setFileType(e.target.value)
              setPage(1)
            }}
            style={{ width: 'auto', padding: '3px 8px', fontSize: 13 }}
          >
            {FILE_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Resources List */}
      {loading ? (
        <div className="loading">
          <div className="spinner" />
          加载中...
        </div>
      ) : resources.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">📚</div>
            <h3>暂无资源</h3>
            <p>{isTeacher ? '点击上方按钮上传第一个学习资源' : '教师尚未上传资源'}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>文件名</th>
                  <th>科目</th>
                  <th>类型</th>
                  <th>大小</th>
                  <th>上传者</th>
                  <th>上传时间</th>
                  {isTeacher && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{getFileIcon(r.file_type)}</span>
                        <span style={{ fontWeight: 500 }}>{r.file_name}</span>
                      </div>
                    </td>
                    <td>
                      {r.subject ? (
                        <span className="tag" style={{ fontSize: 11 }}>
                          {r.subject}
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>通用</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-blue" style={{ textTransform: 'uppercase' }}>
                        {r.file_type}
                      </span>
                    </td>
                    <td style={{ color: '#6b7280', fontSize: 13 }}>{formatFileSize(r.file_size)}</td>
                    <td style={{ color: '#6b7280', fontSize: 13 }}>{r.uploader_name || '-'}</td>
                    <td style={{ color: '#6b7280', fontSize: 13 }}>{formatDate(r.create_time)}</td>
                    {isTeacher && (
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(r.id, r.file_name)}
                        >
                          删除
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 8,
                marginTop: 16,
                alignItems: 'center'
              }}
            >
              <button
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </button>
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                {page} / {totalPages}（共 {total} 条）
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Resources
