"""系统托盘图标 + 退出身份验证（服务器离线时使用本地缓存哈希）"""
import hashlib
import logging
import os
from PyQt6.QtCore import Qt, QObject, pyqtSignal
from PyQt6.QtGui import QIcon, QPixmap, QPainter, QColor, QBrush, QPen, QFont
from PyQt6.QtWidgets import (
    QSystemTrayIcon, QMenu, QDialog, QVBoxLayout, QHBoxLayout,
    QLabel, QLineEdit, QPushButton, QApplication,
)

logger = logging.getLogger(__name__)

_QSS_DIALOG = """
QDialog { background: #F9F7F4; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; }
QLabel { color: #1A1815; }
QLineEdit {
    background: white; border: 1.5px solid #D4D0CA; border-radius: 8px;
    padding: 9px 12px; font-size: 13px; color: #1A1815;
}
QLineEdit:focus { border-color: #D97757; }
QPushButton#primary {
    background: #D97757; color: white; border: none; border-radius: 8px;
    padding: 10px 0; font-size: 13px; font-weight: 600;
}
QPushButton#primary:hover { background: #C4663E; }
QPushButton#primary:disabled { background: #D4D0CA; color: #9A9690; }
QPushButton#secondary {
    background: transparent; border: 1.5px solid #D4D0CA; border-radius: 8px;
    padding: 10px 0; font-size: 13px; color: #6B6560;
}
QPushButton#secondary:hover { border-color: #9A9690; }
"""

_QSS_MENU = """
QMenu {
    background: #1C1917; border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px; padding: 4px;
}
QMenu::item {
    color: #F9F7F4; padding: 8px 18px 8px 12px;
    font-size: 13px; border-radius: 6px;
    font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
}
QMenu::item:selected { background: rgba(217,119,87,0.22); }
QMenu::item:disabled { color: rgba(249,247,244,0.3); }
QMenu::separator { height: 1px; background: rgba(255,255,255,0.08); margin: 3px 8px; }
"""


# ── 本地监护人凭证缓存（SHA-256 哈希） ──────────────────────────────────────

def _hash_path() -> str:
    base = os.environ.get('APPDATA', os.path.expanduser('~'))
    return os.path.join(base, 'PersonalAC', 'guardian_hash.dat')


def _load_cached_hash() -> str:
    try:
        with open(_hash_path(), 'r') as f:
            return f.read().strip()
    except OSError:
        return ''


def _save_cached_hash(email: str, password: str):
    """将成功验证的监护人凭证 SHA-256 哈希保存到本地"""
    h = hashlib.sha256(f'{email}:{password}'.encode()).hexdigest()
    try:
        os.makedirs(os.path.dirname(_hash_path()), exist_ok=True)
        with open(_hash_path(), 'w') as f:
            f.write(h)
    except OSError as e:
        logger.warning('save guardian hash failed: %s', e)


def _verify_cached(email: str, password: str) -> bool:
    cached = _load_cached_hash()
    if not cached:
        return False
    h = hashlib.sha256(f'{email}:{password}'.encode()).hexdigest()
    return h == cached


# ── 托盘图标 ─────────────────────────────────────────────────────────────────

def _make_icon(size: int = 64) -> QIcon:
    pm = QPixmap(size, size)
    pm.fill(Qt.GlobalColor.transparent)
    p = QPainter(pm)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    p.setBrush(QBrush(QColor('#D97757')))
    p.setPen(Qt.PenStyle.NoPen)
    r = size // 6
    p.drawRoundedRect(0, 0, size, size, r, r)
    font = QFont('Segoe UI', size * 38 // 100, QFont.Weight.Bold)
    p.setFont(font)
    p.setPen(QPen(QColor('white')))
    p.drawText(0, 0, size, size, Qt.AlignmentFlag.AlignCenter, 'P')
    p.end()
    return QIcon(pm)


# ── 验证弹窗 ──────────────────────────────────────────────────────────────────

class _GuardianVerifyDialog(QDialog):
    def __init__(self, offline_mode: bool = False, parent=None):
        super().__init__(parent)
        self.setWindowTitle('退出 PersonalAC')
        self.setFixedSize(340, 270)
        self.setWindowFlags(Qt.WindowType.Dialog | Qt.WindowType.WindowStaysOnTopHint)
        self.setStyleSheet(_QSS_DIALOG)
        self._offline = offline_mode
        self._build_ui()

    def _build_ui(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(28, 28, 28, 22)
        lay.setSpacing(0)

        title = QLabel('需要监护人验证')
        title.setStyleSheet('font-size:16px; font-weight:800; letter-spacing:-0.3px;')
        lay.addWidget(title)
        lay.addSpacing(6)

        hint_text = (
            '服务器暂时无法连接，将使用本地缓存验证'
            if self._offline else
            '输入监护人的邮箱和密码来关闭 PersonalAC'
        )
        hint = QLabel(hint_text)
        hint.setStyleSheet(
            f'font-size:12px; color:{"#D97757" if self._offline else "#9A9690"};'
        )
        hint.setWordWrap(True)
        lay.addWidget(hint)
        lay.addSpacing(22)

        email_lbl = QLabel('监护人邮箱')
        email_lbl.setStyleSheet('font-size:11px; font-weight:600; color:#6B6560;')
        lay.addWidget(email_lbl)
        lay.addSpacing(5)
        self._email = QLineEdit()
        self._email.setPlaceholderText('guardian@example.com')
        lay.addWidget(self._email)
        lay.addSpacing(12)

        pw_lbl = QLabel('密码')
        pw_lbl.setStyleSheet('font-size:11px; font-weight:600; color:#6B6560;')
        lay.addWidget(pw_lbl)
        lay.addSpacing(5)
        self._pw = QLineEdit()
        self._pw.setEchoMode(QLineEdit.EchoMode.Password)
        self._pw.setPlaceholderText('监护人密码')
        self._pw.returnPressed.connect(self._try_confirm)
        lay.addWidget(self._pw)
        lay.addSpacing(6)

        self._status = QLabel('')
        self._status.setStyleSheet('font-size:11px; color:#E53E3E; min-height:14px;')
        lay.addWidget(self._status)
        lay.addSpacing(14)

        btn_row = QHBoxLayout()
        btn_row.setSpacing(8)
        cancel = QPushButton('取消')
        cancel.setObjectName('secondary')
        cancel.clicked.connect(self.reject)
        btn_row.addWidget(cancel)
        self._confirm_btn = QPushButton('确认退出')
        self._confirm_btn.setObjectName('primary')
        self._confirm_btn.clicked.connect(self._try_confirm)
        btn_row.addWidget(self._confirm_btn)
        lay.addLayout(btn_row)

    def get_credentials(self) -> tuple[str, str]:
        return self._email.text().strip(), self._pw.text()

    def show_error(self, msg: str):
        self._status.setText(msg)
        self._confirm_btn.setEnabled(True)
        self._confirm_btn.setText('确认退出')

    def set_loading(self, loading: bool):
        self._confirm_btn.setEnabled(not loading)
        self._confirm_btn.setText('验证中…' if loading else '确认退出')

    def _try_confirm(self):
        email, pw = self.get_credentials()
        if not email or not pw:
            self._status.setText('请填写邮箱和密码')
            return
        self.set_loading(True)
        self._status.setText('')
        self.accept()


# ── SystemTray ────────────────────────────────────────────────────────────────

class SystemTray(QObject):
    show_pet        = pyqtSignal()
    show_main       = pyqtSignal()
    open_drive_settings = pyqtSignal()
    quit_verified   = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._api = None
        self._tray = QSystemTrayIcon(parent)
        self._tray.setIcon(_make_icon())
        self._tray.setToolTip('PersonalAC 学生端')
        self._tray.activated.connect(self._on_activated)
        self._build_menu()
        self._tray.show()

    def set_api(self, api):
        self._api = api

    def _build_menu(self):
        menu = QMenu()
        menu.setStyleSheet(_QSS_MENU)

        self._act_pet = menu.addAction('显示宠物')
        self._act_pet.triggered.connect(self.show_pet)

        self._act_main = menu.addAction('打开学习界面')
        self._act_main.triggered.connect(self.show_main)

        self._act_drive = menu.addAction('☁️ 云盘设置…')
        self._act_drive.triggered.connect(self.open_drive_settings)

        menu.addSeparator()
        menu.addAction('退出 PersonalAC…').triggered.connect(self._on_quit)
        self._tray.setContextMenu(menu)

    def _on_activated(self, reason):
        if reason == QSystemTrayIcon.ActivationReason.DoubleClick:
            self.show_pet.emit()

    def _on_quit(self):
        # 先尝试联网验证
        server_ok = False
        dlg = None

        if self._api:
            dlg = _GuardianVerifyDialog(offline_mode=False)
            if dlg.exec() != QDialog.DialogCode.Accepted:
                return
            email, password = dlg.get_credentials()
            if not email or not password:
                return

            ok, err = self._api.verify_guardian(email, password)
            if ok:
                # 联网验证成功：更新本地缓存并退出
                _save_cached_hash(email, password)
                self.quit_verified.emit()
                return

            if err == '无法连接服务器':
                # 服务器离线：尝试本地缓存
                if _verify_cached(email, password):
                    logger.info('Guardian verified via local cache (server offline)')
                    self.quit_verified.emit()
                    return
                dlg.show_error('服务器无法连接，且本地没有缓存的验证记录\n请先在联网状态下验证一次')
                # 保持弹窗显示错误，用户只能取消
                dlg.set_loading(False)
                # Re-exec to show error (already accepted, just show error state)
                dlg2 = _GuardianVerifyDialog(offline_mode=True)
                if dlg2.exec() != QDialog.DialogCode.Accepted:
                    return
                e2, p2 = dlg2.get_credentials()
                if _verify_cached(e2, p2):
                    logger.info('Guardian verified via local cache on retry')
                    self.quit_verified.emit()
                else:
                    dlg2.show_error('本地缓存验证失败，请稍后在联网状态下重试')
                    self.notify('退出失败', '需要联网验证监护人身份', QSystemTrayIcon.MessageIcon.Warning)
            else:
                dlg.show_error(err or '邮箱或密码错误')
                self.notify('验证失败', err or '邮箱或密码错误', QSystemTrayIcon.MessageIcon.Warning)
        else:
            # 没有 API（初始化阶段），不允许退出
            self.notify('无法退出', '应用尚未完成初始化', QSystemTrayIcon.MessageIcon.Warning)

    def notify(self, title: str, message: str,
               icon=QSystemTrayIcon.MessageIcon.Information,
               duration_ms: int = 5000):
        if self._tray.isVisible() and self._tray.supportsMessages():
            self._tray.showMessage(title, message, icon, duration_ms)

    def update_tooltip(self, mode: str, student_name: str):
        mode_map = {'locked': '专注模式', 'pet': '宠物模式', 'free': '自由模式'}
        self._tray.setToolTip(f'PersonalAC — {student_name} · {mode_map.get(mode, mode)}')

    def set_pet_visible(self, visible: bool):
        self._act_pet.setText('隐藏宠物' if visible else '显示宠物')
