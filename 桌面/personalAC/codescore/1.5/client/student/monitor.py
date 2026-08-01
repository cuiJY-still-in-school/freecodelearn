import sys
import time
import logging
import threading
from datetime import datetime
from typing import Optional

import psutil
from PyQt6.QtCore import QThread, pyqtSignal

from common.app_category import categorize
from common.browser_url import get_browser_url, is_browser

logger = logging.getLogger(__name__)


# ── 前台窗口信息（返回 app_name, window_title, hwnd） ─────────────────────────

def _get_foreground_info_windows() -> tuple[str, str, int]:
    try:
        import ctypes.wintypes
        import win32process
        import win32gui

        hwnd = win32gui.GetForegroundWindow()
        if not hwnd:
            return '', '', 0
        title = win32gui.GetWindowText(hwnd)
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        try:
            proc = psutil.Process(pid)
            return proc.name(), title, hwnd
        except psutil.NoSuchProcess:
            return '', title, hwnd
    except Exception as e:
        logger.debug('win32 foreground query failed: %s', e)
        return '', '', 0


def _get_foreground_info_mac() -> tuple[str, str, int]:
    try:
        import subprocess
        script = (
            'tell application "System Events" to get '
            '{name, title of first window} of first application process '
            'whose frontmost is true'
        )
        result = subprocess.run(['osascript', '-e', script],
                                capture_output=True, text=True, timeout=2)
        if result.returncode == 0:
            out = result.stdout.strip()
            parts = [p.strip() for p in out.split(',', 1)]
            app_name = parts[0] if parts else ''
            title = parts[1] if len(parts) > 1 else ''
            return app_name, title, 0
    except Exception as e:
        logger.debug('osascript foreground query failed: %s', e)
    return '', '', 0


def _get_foreground_info_fallback() -> tuple[str, str, int]:
    try:
        top = max(
            (p for p in psutil.process_iter(['name', 'cpu_percent'])
             if p.info['cpu_percent'] is not None),
            key=lambda p: p.info['cpu_percent'],
            default=None,
        )
        if top:
            return top.info['name'], '', 0
    except Exception:
        pass
    return '', '', 0


def get_foreground_info() -> tuple[str, str, int]:
    """返回 (app_name, window_title, hwnd)"""
    if sys.platform == 'win32':
        return _get_foreground_info_windows()
    if sys.platform == 'darwin':
        return _get_foreground_info_mac()
    return _get_foreground_info_fallback()


# ── 空闲时长检测 ──────────────────────────────────────────────────────────────

def get_idle_seconds() -> float:
    """返回系统最后输入以来的秒数，失败返回 0"""
    try:
        if sys.platform == 'win32':
            import ctypes
            import ctypes.wintypes

            class LASTINPUTINFO(ctypes.Structure):
                _fields_ = [('cbSize', ctypes.c_uint), ('dwTime', ctypes.c_uint)]

            lii = LASTINPUTINFO()
            lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
            ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii))
            elapsed = ctypes.windll.kernel32.GetTickCount() - lii.dwTime
            return max(elapsed / 1000.0, 0.0)

        if sys.platform == 'darwin':
            import subprocess
            r = subprocess.run(
                ['python3', '-c',
                 'import Quartz; '
                 'print(Quartz.CGEventSourceSecondsSinceLastEventType('
                 'Quartz.kCGEventSourceStateHIDSystemState, '
                 'Quartz.kCGAnyInputEventType))'],
                capture_output=True, text=True, timeout=2
            )
            if r.returncode == 0:
                return float(r.stdout.strip())

        # Linux: try xprintidle (ms)
        import subprocess
        r = subprocess.run(['xprintidle'], capture_output=True, text=True, timeout=2)
        if r.returncode == 0:
            return int(r.stdout.strip()) / 1000.0

    except Exception:
        pass
    return 0.0


# ── blocked_apps 匹配 ─────────────────────────────────────────────────────────

def _is_blocked(app_name: str, window_title: str, url: str,
                blocked_patterns: list[str]) -> bool:
    """对进程名、标题、URL 都做子串匹配"""
    low_app = app_name.lower().replace('.exe', '')
    low_title = window_title.lower()
    low_url = url.lower()
    for pat in blocked_patterns:
        if pat in low_app or pat in low_title or (low_url and pat in low_url):
            return True
    return False


# ── 会话记录 ──────────────────────────────────────────────────────────────────

class _Session:
    def __init__(self, app_name: str, window_title: str, url: str, category: str):
        self.app_name = app_name
        self.window_title = window_title
        self.url = url
        self.category = category
        self.start_time: datetime = datetime.now()
        self._idle_acc: float = 0.0
        self._last_sample: float = time.monotonic()

    def add_idle(self, idle_seconds: float):
        now = time.monotonic()
        interval = now - self._last_sample
        self._last_sample = now
        # 只把这次采样区间内的空闲时间算进去（不超过区间长度）
        self._idle_acc += min(idle_seconds, interval)

    def finish(self) -> dict:
        end_time = datetime.now()
        duration = max(int((end_time - self.start_time).total_seconds()), 1)
        return {
            'app_name':        self.app_name,
            'window_title':    self.window_title,
            'url':             self.url,
            'category':        self.category,
            'duration_seconds': duration,
            'idle_seconds':    int(self._idle_acc),
            'timestamp':       int(self.start_time.timestamp() * 1000),
        }


# ── ActivityMonitor ───────────────────────────────────────────────────────────

class ActivityMonitor(QThread):
    activity_changed = pyqtSignal(str, str)      # (app_name, window_title)
    blocked_app_detected = pyqtSignal(str, str)  # (app_name, window_title)

    def __init__(self, blocked_apps: list = None, parent=None):
        super().__init__(parent)
        self.blocked_apps: list[str] = [a.lower() for a in (blocked_apps or [])]
        self._running = False
        self._pending: list[dict] = []
        self._pending_lock = threading.Lock()
        self._current_session: Optional[_Session] = None

    def run(self):
        self._running = True
        while self._running:
            app_name, window_title, hwnd = get_foreground_info()
            if app_name:
                url = get_browser_url(app_name, hwnd) if is_browser(app_name) else ''
                idle = get_idle_seconds()

                # blocked_apps 检查（进程名 + 标题 + URL）
                if self.blocked_apps and _is_blocked(app_name, window_title, url, self.blocked_apps):
                    self.blocked_app_detected.emit(app_name, window_title)

                if (self._current_session is None
                        or self._current_session.app_name != app_name):
                    if self._current_session is not None:
                        record = self._current_session.finish()
                        if record['duration_seconds'] >= 2:
                            with self._pending_lock:
                                self._pending.append(record)

                    cat = categorize(app_name, url)
                    self._current_session = _Session(app_name, window_title, url, cat)
                    self.activity_changed.emit(app_name, window_title)
                else:
                    # 更新动态字段
                    self._current_session.window_title = window_title
                    if url:
                        self._current_session.url = url
                        self._current_session.category = categorize(app_name, url)
                    self._current_session.add_idle(idle)

            time.sleep(3)

    def stop(self):
        self._running = False
        if self._current_session is not None:
            record = self._current_session.finish()
            if record['duration_seconds'] >= 2:
                with self._pending_lock:
                    self._pending.append(record)
            self._current_session = None
        self.wait(3000)

    def get_pending_records(self) -> list[dict]:
        with self._pending_lock:
            records = list(self._pending)
            self._pending.clear()
        return records

    def return_records(self, records: list[dict]):
        """同步失败时将记录放回队列"""
        with self._pending_lock:
            self._pending[:0] = records

    def update_blocked_apps(self, blocked_apps: list):
        self.blocked_apps = [a.lower() for a in blocked_apps]
