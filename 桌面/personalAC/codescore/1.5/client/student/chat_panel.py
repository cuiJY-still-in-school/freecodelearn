"""原生 Qt 流式 AI 聊天面板，供锁定模式主窗口使用"""
import json
import logging
from PyQt6.QtCore import Qt, QThread, pyqtSignal, QTimer
from PyQt6.QtGui import QTextCursor, QKeyEvent
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QTextEdit, QPushButton,
)

from common.api import PersonalACApi

logger = logging.getLogger(__name__)

_PANEL_QSS = """
QWidget#chat_panel { background: #1A1815; }
QTextEdit#display {
    background: #1A1815; border: none;
    color: #F9F7F4; font-size: 13px;
    font-family: 'Segoe UI', 'PingFang SC', Consolas, sans-serif;
    selection-background-color: rgba(217,119,87,0.3);
}
QTextEdit#input_box {
    background: #252220;
    border: 1.5px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    color: #F9F7F4; font-size: 13px;
    font-family: 'Segoe UI', 'PingFang SC', sans-serif;
    padding: 8px 12px;
}
QTextEdit#input_box:focus { border-color: rgba(217,119,87,0.6); }
QPushButton#send_btn {
    background: #D97757; border: none; border-radius: 8px;
    color: white; font-size: 13px; font-weight: 600;
    padding: 0 18px; min-width: 60px; min-height: 36px;
    font-family: 'Segoe UI', sans-serif;
}
QPushButton#send_btn:hover { background: #C4663E; }
QPushButton#send_btn:disabled { background: rgba(217,119,87,0.3); color: rgba(255,255,255,0.4); }
QScrollBar:vertical { width: 4px; background: transparent; }
QScrollBar::handle:vertical { background: rgba(255,255,255,0.15); border-radius: 2px; }
"""

_WELCOME_HTML = (
    '<div style="padding:20px 16px 12px 16px;">'
    '<p style="color:#D97757;font-weight:700;font-size:14px;margin:0 0 8px 0;">Hi！我是你的 AI 助手</p>'
    '<p style="color:rgba(249,247,244,0.55);font-size:12px;margin:0;">'
    '现在是专注模式，我可以帮你解题、讲概念、检查答案。<br>'
    '有什么想问的尽管说&nbsp;👇</p></div>'
)


def _esc(text: str) -> str:
    return (text.replace('&', '&amp;').replace('<', '&lt;')
            .replace('>', '&gt;').replace('"', '&quot;'))


class _StreamWorker(QThread):
    token  = pyqtSignal(str)
    done   = pyqtSignal()
    error  = pyqtSignal(str)

    def __init__(self, api: PersonalACApi, messages: list[dict], parent=None):
        super().__init__(parent)
        self.api = api
        self.messages = messages
        self._abort = False

    def abort(self):
        self._abort = True

    def run(self):
        import requests
        try:
            url = f'{self.api.server_url}/api/chat/stream'
            hdrs = {
                'x-sync-token': self.api.sync_token,
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
            }
            with requests.post(url, data=json.dumps({'messages': self.messages}),
                               headers=hdrs, stream=True, timeout=60) as resp:
                resp.raise_for_status()
                buf = ''
                for chunk in resp.iter_content(chunk_size=None, decode_unicode=True):
                    if self._abort:
                        break
                    buf += chunk
                    while '\n' in buf:
                        line, buf = buf.split('\n', 1)
                        line = line.strip()
                        if not line.startswith('data:'):
                            continue
                        raw = line[5:].strip()
                        if raw in ('[DONE]', 'done'):
                            self.done.emit()
                            return
                        try:
                            obj = json.loads(raw)
                            if 'token' in obj:
                                self.token.emit(obj['token'])
                            elif obj.get('done'):
                                self.done.emit()
                                return
                            elif 'error' in obj:
                                self.error.emit(obj['error'])
                                return
                        except json.JSONDecodeError:
                            pass
            self.done.emit()
        except Exception as e:
            if not self._abort:
                self.error.emit(str(e))


class ChatPanel(QWidget):
    def __init__(self, api: PersonalACApi, student_name: str = '', parent=None):
        super().__init__(parent)
        self.api = api
        self.student_name = student_name or '同学'
        self.setObjectName('chat_panel')
        self.setStyleSheet(_PANEL_QSS)
        self._messages: list[dict] = []
        self._worker: _StreamWorker | None = None
        self._streaming = False
        self._ai_buf = ''          # accumulates current AI response
        self._ai_anchor = 0        # char position where AI response starts
        self._build_ui()

    def _build_ui(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        # ── header ──────────────────────────────────────────────────────────
        header = QWidget()
        header.setFixedHeight(52)
        header.setStyleSheet('background:#111009; border-bottom:1px solid rgba(255,255,255,0.06);')
        hl = QHBoxLayout(header)
        hl.setContentsMargins(16, 0, 16, 0)
        title = QLabel('AI 助手')
        title.setStyleSheet(
            "color:#F9F7F4; font-size:14px; font-weight:700; "
            "font-family:'Segoe UI','PingFang SC',sans-serif;"
        )
        hl.addWidget(title)
        hl.addStretch()
        self._dot = QLabel('●')
        self._dot.setStyleSheet('color:#4ADE80; font-size:10px;')
        hl.addWidget(self._dot)
        outer.addWidget(header)

        # ── message display ──────────────────────────────────────────────────
        self._display = QTextEdit()
        self._display.setObjectName('display')
        self._display.setReadOnly(True)
        self._display.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self._display.setHtml(_WELCOME_HTML)
        outer.addWidget(self._display, 1)

        # ── thinking bar ─────────────────────────────────────────────────────
        self._thinking = QLabel('AI 正在思考…')
        self._thinking.setStyleSheet(
            'background:rgba(217,119,87,0.12); color:#D97757; '
            "font-size:11px; padding:5px 16px; font-family:'Segoe UI',sans-serif;"
        )
        self._thinking.hide()
        outer.addWidget(self._thinking)

        # ── input area ───────────────────────────────────────────────────────
        ia = QWidget()
        ia.setStyleSheet('background:#111009; border-top:1px solid rgba(255,255,255,0.06);')
        il = QHBoxLayout(ia)
        il.setContentsMargins(12, 10, 12, 10)
        il.setSpacing(8)

        self._input = QTextEdit()
        self._input.setObjectName('input_box')
        self._input.setPlaceholderText('输入问题，按 Ctrl+Enter 发送…')
        self._input.setFixedHeight(68)
        self._input.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._input.installEventFilter(self)
        il.addWidget(self._input, 1)

        self._btn = QPushButton('发送')
        self._btn.setObjectName('send_btn')
        self._btn.setFixedHeight(68)
        self._btn.clicked.connect(self._on_send)
        il.addWidget(self._btn)
        outer.addWidget(ia)

    # ── event filter (Ctrl+Enter) ────────────────────────────────────────────

    def eventFilter(self, obj, event):
        if (obj is self._input
                and isinstance(event, QKeyEvent)
                and event.type() == QKeyEvent.Type.KeyPress
                and event.key() == Qt.Key.Key_Return
                and event.modifiers() & Qt.KeyboardModifier.ControlModifier):
            self._on_send()
            return True
        return super().eventFilter(obj, event)

    # ── send ─────────────────────────────────────────────────────────────────

    def _on_send(self):
        if self._streaming:
            return
        text = self._input.toPlainText().strip()
        if not text:
            return
        self._input.clear()
        self._messages.append({'role': 'user', 'content': text})
        self._append_user_bubble(text)
        self._begin_stream()

    def _append_user_bubble(self, text: str):
        self._display.append(
            f'<div style="margin:12px 0 4px 0;text-align:right;">'
            f'<span style="display:inline-block;background:#D97757;color:white;'
            f'border-radius:10px 10px 2px 10px;padding:8px 12px;'
            f'font-size:13px;">{_esc(text)}</span></div>'
        )
        self._scroll_end()

    def _begin_stream(self):
        self._streaming = True
        self._btn.setEnabled(False)
        self._thinking.show()
        self._ai_buf = ''

        # Mark the current end position so we know where to insert AI response
        self._ai_anchor = self._display.document().characterCount()

        self._worker = _StreamWorker(self.api, list(self._messages))
        self._worker.token.connect(self._on_token)
        self._worker.done.connect(self._on_done)
        self._worker.error.connect(self._on_error)
        self._worker.start()

    def _on_token(self, token: str):
        was_empty = not self._ai_buf
        self._ai_buf += token
        if was_empty:
            self._thinking.hide()
            # Insert initial AI label
            cursor = self._display.textCursor()
            cursor.movePosition(QTextCursor.MoveOperation.End)
            cursor.insertHtml(
                '<div style="margin:4px 0 2px 0;">'
                '<span style="color:#D97757;font-size:11px;font-weight:600;">AI</span>&nbsp;'
                '</div>'
            )
            self._scroll_end()
        # Append token text directly
        cursor = self._display.textCursor()
        cursor.movePosition(QTextCursor.MoveOperation.End)
        cursor.insertText(token)
        self._display.setTextCursor(cursor)
        self._scroll_end()

    def _on_done(self):
        self._thinking.hide()
        self._streaming = False
        self._btn.setEnabled(True)
        if self._ai_buf:
            self._messages.append({'role': 'assistant', 'content': self._ai_buf})
        self._ai_buf = ''
        # Add spacing after AI response
        cursor = self._display.textCursor()
        cursor.movePosition(QTextCursor.MoveOperation.End)
        cursor.insertHtml('<p style="margin:0 0 10px 0;">&nbsp;</p>')
        self._scroll_end()

    def _on_error(self, msg: str):
        self._thinking.hide()
        self._streaming = False
        self._btn.setEnabled(True)
        self._ai_buf = ''
        self._display.append(
            f'<div style="color:#F87171;font-size:12px;margin:4px 0 12px 0;">'
            f'连接出错：{_esc(msg)}</div>'
        )
        self._scroll_end()

    def set_connection_ok(self, ok: bool):
        self._dot.setStyleSheet(f'color:{"#4ADE80" if ok else "#F87171"}; font-size:10px;')

    def _scroll_end(self):
        sb = self._display.verticalScrollBar()
        sb.setValue(sb.maximum())
