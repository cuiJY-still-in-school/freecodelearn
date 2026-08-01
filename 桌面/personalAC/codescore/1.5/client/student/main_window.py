"""锁定模式主窗口：原生 Qt，左侧任务面板 + 右侧 AI 聊天面板"""
import sys
from datetime import date, datetime
from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QKeyEvent, QColor, QPainter, QBrush
from PyQt6.QtWidgets import (
    QMainWindow, QWidget, QHBoxLayout, QVBoxLayout,
    QLabel, QSizePolicy,
)

from common.config import Config
from common.api import PersonalACApi
from student.task_panel import TaskPanel
from student.chat_panel import ChatPanel

_SHIELD_SVG = """
<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M11 2L3 5.5V11C3 15.418 6.582 19 11 20C15.418 19 19 15.418 19 11V5.5L11 2Z"
        fill="#D97757" stroke="#F5C49A" stroke-width="0.8"/>
  <path d="M8 11l2 2 4-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
"""


class _StatusDot(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedSize(10, 10)
        self._ok = True

    def set_ok(self, ok: bool):
        self._ok = ok
        self.update()

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(QColor('#4ADE80' if self._ok else '#F87171')))
        p.drawEllipse(0, 0, 10, 10)
        p.end()


class _ProgressBadge(QLabel):
    def __init__(self, parent=None):
        super().__init__(parent)
        self._done = 0
        self._total = 0
        self._refresh()

    def update_progress(self, done: int, total: int):
        self._done = done
        self._total = total
        self._refresh()

    def _refresh(self):
        text = f'任务 {self._done}/{self._total}'
        color = '#4ADE80' if (self._done >= self._total > 0) else '#D97757'
        self.setText(text)
        self.setStyleSheet(
            f"color:{color}; font-size:12px; font-weight:600;"
            f"background:rgba(255,255,255,0.08); border-radius:10px;"
            f"padding:2px 10px; font-family:'Segoe UI','PingFang SC',sans-serif;"
        )


class TopBar(QWidget):
    def __init__(self, config: Config, parent=None):
        super().__init__(parent)
        self.setFixedHeight(52)
        self.setStyleSheet('background:#1A1815;')

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 16, 0)
        layout.setSpacing(0)

        # logo
        logo_w = QWidget()
        logo_w.setFixedWidth(160)
        ll = QHBoxLayout(logo_w)
        ll.setContentsMargins(16, 0, 8, 0)
        ll.setSpacing(8)
        try:
            from PyQt6.QtSvgWidgets import QSvgWidget
            from PyQt6.QtCore import QByteArray
            svg = QSvgWidget()
            svg.load(QByteArray(_SHIELD_SVG.encode()))
            svg.setFixedSize(22, 22)
            ll.addWidget(svg)
        except ImportError:
            pass
        lbl = QLabel('PersonalAC')
        lbl.setStyleSheet(
            "color:#F9F7F4; font-size:15px; font-weight:700;"
            "font-family:'Segoe UI','PingFang SC',sans-serif; letter-spacing:0.5px;"
        )
        ll.addWidget(lbl)
        ll.addStretch()
        layout.addWidget(logo_w)

        # center: name + date
        center = QWidget()
        cl = QVBoxLayout(center)
        cl.setContentsMargins(0, 6, 0, 6)
        cl.setSpacing(1)
        cl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._name_lbl = QLabel(config.student_name or '学生')
        self._name_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._name_lbl.setStyleSheet(
            "color:#F9F7F4; font-size:13px; font-weight:600;"
            "font-family:'Segoe UI','PingFang SC',sans-serif;"
        )
        date_lbl = QLabel(date.today().strftime('%Y年%m月%d日'))
        date_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        date_lbl.setStyleSheet(
            "color:rgba(249,247,244,0.5); font-size:11px;"
            "font-family:'Segoe UI','PingFang SC',sans-serif;"
        )
        cl.addWidget(self._name_lbl)
        cl.addWidget(date_lbl)
        layout.addWidget(center, 1)

        # right: focus badge + progress + dot
        right = QWidget()
        rl = QHBoxLayout(right)
        rl.setContentsMargins(0, 0, 0, 0)
        rl.setSpacing(10)
        rl.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)

        self._focus_lbl = QLabel('· 专注模式')
        self._focus_lbl.setStyleSheet(
            "color:#D97757; font-size:12px; font-weight:600;"
            "background:rgba(217,119,87,0.15); border-radius:10px;"
            "padding:2px 10px; font-family:'Segoe UI','PingFang SC',sans-serif;"
        )
        self._focus_lbl.hide()
        rl.addWidget(self._focus_lbl)

        self._badge = _ProgressBadge()
        rl.addWidget(self._badge)

        self._dot = _StatusDot()
        rl.addWidget(self._dot)
        layout.addWidget(right)

    def update_progress(self, done: int, total: int):
        self._badge.update_progress(done, total)

    def set_connection_ok(self, ok: bool):
        self._dot.set_ok(ok)

    def set_focus_mode(self, active: bool):
        self._focus_lbl.setVisible(active)


class BottomBar(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(28)
        self.setStyleSheet('background:#111009; border-top:1px solid rgba(255,255,255,0.06);')

        layout = QHBoxLayout(self)
        layout.setContentsMargins(16, 0, 16, 0)
        layout.setSpacing(10)

        self._time_lbl = QLabel()
        self._time_lbl.setStyleSheet(
            "color:rgba(249,247,244,0.4); font-size:11px;"
            "font-family:'Segoe UI',Consolas,sans-serif;"
        )
        layout.addStretch()
        layout.addWidget(self._time_lbl)

        self._conn_dot = _StatusDot()
        self._conn_lbl = QLabel('已连接')
        self._conn_lbl.setStyleSheet(
            "color:rgba(249,247,244,0.4); font-size:11px; font-family:'Segoe UI',sans-serif;"
        )
        layout.addWidget(self._conn_dot)
        layout.addWidget(self._conn_lbl)

        clock = QTimer(self)
        clock.setInterval(1000)
        clock.timeout.connect(self._tick)
        clock.start()
        self._tick()

    def _tick(self):
        self._time_lbl.setText(datetime.now().strftime('%H:%M:%S'))

    def set_connection_ok(self, ok: bool):
        self._conn_dot.set_ok(ok)
        self._conn_lbl.setText('已连接' if ok else '连接断开')
        color = 'rgba(249,247,244,0.4)' if ok else '#F87171'
        self._conn_lbl.setStyleSheet(
            f"color:{color}; font-size:11px; font-family:'Segoe UI',sans-serif;"
        )


class MainWindow(QMainWindow):
    mustdo_complete = pyqtSignal()

    def __init__(self, config: Config, api: PersonalACApi, parent=None):
        super().__init__(parent)
        self.config = config
        self.api = api

        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
        )
        self.showFullScreen()
        self._setup_ui()
        self._setup_timers()
        QTimer.singleShot(1500, self._task_panel.refresh)

    def _setup_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        vl = QVBoxLayout(central)
        vl.setContentsMargins(0, 0, 0, 0)
        vl.setSpacing(0)

        self._top_bar = TopBar(self.config)
        vl.addWidget(self._top_bar)

        # main content: task panel (left) + chat panel (right)
        content = QWidget()
        content.setStyleSheet('background:#1A1815;')
        hl = QHBoxLayout(content)
        hl.setContentsMargins(0, 0, 0, 0)
        hl.setSpacing(0)

        self._task_panel = TaskPanel(self.api)
        self._task_panel.progress_changed.connect(self._on_progress)
        self._task_panel.all_done.connect(self._on_all_done)
        hl.addWidget(self._task_panel)

        self._chat_panel = ChatPanel(self.api, self.config.student_name)
        hl.addWidget(self._chat_panel, 1)

        vl.addWidget(content, 1)

        self._bottom_bar = BottomBar()
        vl.addWidget(self._bottom_bar)

    def _setup_timers(self):
        self._conn_timer = QTimer(self)
        self._conn_timer.setInterval(30_000)
        self._conn_timer.timeout.connect(self._check_connection)
        self._conn_timer.start()

    def _check_connection(self):
        try:
            cfg = self.api.get_client_config()
            ok = bool(cfg)
            self._top_bar.set_connection_ok(ok)
            self._bottom_bar.set_connection_ok(ok)
            self._chat_panel.set_connection_ok(ok)
            if ok and cfg.get('mode') in ('pet', 'free'):
                self._conn_timer.stop()
                self.mustdo_complete.emit()
        except Exception:
            self._top_bar.set_connection_ok(False)
            self._bottom_bar.set_connection_ok(False)

    def _on_progress(self, done: int, total: int):
        self._top_bar.update_progress(done, total)
        self._task_panel.update_study_time(0)  # caller provides real value via update_study_time

    def _on_all_done(self):
        self.mustdo_complete.emit()

    def update_study_time(self, study_seconds: int):
        self._task_panel.update_study_time(study_seconds)

    def set_focus_mode(self, active: bool):
        self._top_bar.set_focus_mode(active)

    def set_connection_status(self, ok: bool):
        self._top_bar.set_connection_ok(ok)
        self._bottom_bar.set_connection_ok(ok)
        self._chat_panel.set_connection_ok(ok)

    def update_progress(self, done: int, total: int):
        self._top_bar.update_progress(done, total)

    def closeEvent(self, event):
        event.ignore()

    def keyPressEvent(self, event: QKeyEvent):
        blocked = {
            Qt.Key.Key_F4, Qt.Key.Key_Escape,
            Qt.Key.Key_Super_L, Qt.Key.Key_Super_R, Qt.Key.Key_Meta,
        }
        if event.key() in blocked:
            event.ignore()
            return
        mods = event.modifiers()
        alt  = Qt.KeyboardModifier.AltModifier
        ctrl = Qt.KeyboardModifier.ControlModifier
        if mods & alt and event.key() == Qt.Key.Key_F4:
            event.ignore()
            return
        if mods & ctrl and mods & alt:
            event.ignore()
            return
        super().keyPressEvent(event)
