import math
from PyQt6.QtCore import (
    Qt, QPoint, QRect, QPropertyAnimation, QEasingCurve, pyqtSignal,
    QTimer, QSize,
)
from PyQt6.QtGui import (
    QPainter, QColor, QPen, QBrush, QPainterPath, QFont,
)
from PyQt6.QtWidgets import QWidget, QApplication, QLabel, QVBoxLayout, QFrame

from common.config import Config


class StatusPopup(QFrame):
    def __init__(self, parent=None):
        super().__init__(parent, Qt.WindowType.Popup | Qt.WindowType.FramelessWindowHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setFixedSize(220, 168)
        self._setup_ui()

    def _setup_ui(self):
        self.setStyleSheet("""
            QFrame {
                background: rgba(17, 16, 9, 230);
                border-radius: 12px;
                border: 1px solid rgba(217, 119, 87, 0.35);
            }
            QLabel { color: #F9F7F4; font-family: 'Segoe UI', 'PingFang SC', sans-serif; }
        """)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 12, 14, 12)
        layout.setSpacing(5)

        # mode row
        self.mode_label = QLabel("宠物模式")
        self.mode_label.setStyleSheet(
            "font-size: 13px; font-weight: 700; color: #D97757; letter-spacing: 0.3px;"
        )
        layout.addWidget(self.mode_label)

        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.HLine)
        sep.setStyleSheet("color: rgba(217,119,87,0.2);")
        layout.addWidget(sep)

        # study time
        self._row_study = self._make_row("今日学习", "--")
        self.study_lbl = self._row_study[1]
        layout.addLayout(self._row_study[0])

        # task progress
        self._row_task = self._make_row("必做任务", "--")
        self.task_lbl = self._row_task[1]
        layout.addLayout(self._row_task[0])

        # SRS count
        self._row_srs = self._make_row("待复习", "--")
        self.srs_lbl = self._row_srs[1]
        layout.addLayout(self._row_srs[0])

        # active app
        self._row_app = self._make_row("当前应用", "--")
        self.app_lbl = self._row_app[1]
        layout.addLayout(self._row_app[0])

        layout.addStretch()

        hint = QLabel("单击查看 · 双击打开界面")
        hint.setStyleSheet("font-size: 10px; color: rgba(200,197,191,0.45);")
        layout.addWidget(hint)

    def _make_row(self, label: str, value: str):
        from PyQt6.QtWidgets import QHBoxLayout
        row = QHBoxLayout()
        row.setContentsMargins(0, 0, 0, 0)
        row.setSpacing(4)
        lbl = QLabel(label)
        lbl.setStyleSheet("font-size: 11px; color: rgba(200,197,191,0.55); min-width: 56px;")
        val = QLabel(value)
        val.setStyleSheet("font-size: 11px; color: #F9F7F4; font-weight: 500;")
        row.addWidget(lbl)
        row.addWidget(val, 1)
        return row, val

    def update_info(self, mode: str, study_time: str = '--',
                    task_done: int = 0, task_total: int = 0,
                    srs_count: int = 0, current_app: str = '--'):
        mode_map = {"locked": "专注模式", "pet": "宠物模式", "free": "自由模式"}
        self.mode_label.setText(mode_map.get(mode, mode))
        self.study_lbl.setText(study_time)
        if task_total > 0:
            color = "#4ADE80" if task_done >= task_total else "#D97757"
            self.task_lbl.setStyleSheet(f"font-size:11px; color:{color}; font-weight:500;")
            self.task_lbl.setText(f"{task_done}/{task_total}")
        else:
            self.task_lbl.setText("无必做任务")
        self.srs_lbl.setText(f"{srs_count} 个" if srs_count else "已全部复习")
        app_short = current_app[:18] + '…' if len(current_app) > 18 else current_app
        self.app_lbl.setText(app_short or '--')


class PetWindow(QWidget):
    open_main = pyqtSignal()

    PET_SIZE = 110
    ANIM_RANGE = 4

    def __init__(self, config: Config, parent=None):
        super().__init__(parent)
        self.config = config
        self._mood = "happy"
        self._drag_offset = QPoint()
        self._is_dragging = False
        self._popup: StatusPopup | None = None
        self._study_time = '--'
        self._task_done = 0
        self._task_total = 0
        self._srs_count = 0
        self._current_app = '--'
        self._bob_offset = 0.0
        self._bob_angle = 0.0

        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setFixedSize(self.PET_SIZE, self.PET_SIZE + self.ANIM_RANGE * 2)
        self.setMouseTracking(True)

        self._bob_timer = QTimer(self)
        self._bob_timer.setInterval(33)
        self._bob_timer.timeout.connect(self._tick_bob)
        self._bob_timer.start()

        self.restore_position()

    def _tick_bob(self):
        self._bob_angle = (self._bob_angle + 0.06) % (2 * math.pi)
        self._bob_offset = math.sin(self._bob_angle) * self.ANIM_RANGE
        self.update()

    def set_mood(self, mood: str):
        if mood in ("happy", "thinking", "alert"):
            self._mood = mood
            self.update()

    def update_activity_summary(self, summary: str):
        # 保持向后兼容
        self._study_time = summary

    def update_status(self, study_time: str = '--',
                      task_done: int = 0, task_total: int = 0,
                      srs_count: int = 0, current_app: str = '--'):
        self._study_time = study_time
        self._task_done = task_done
        self._task_total = task_total
        self._srs_count = srs_count
        self._current_app = current_app
        if self._popup and self._popup.isVisible():
            self._popup.update_info(
                self.config.mode, self._study_time,
                self._task_done, self._task_total,
                self._srs_count, self._current_app,
            )

    def save_position(self):
        pos = self.pos()
        self.config.pet_position = [pos.x(), pos.y()]
        self.config.save()

    def restore_position(self):
        x, y = self.config.pet_position
        if x is not None and y is not None:
            self.move(x, y)
        else:
            screen = QApplication.primaryScreen().availableGeometry()
            self.move(
                screen.right() - self.PET_SIZE - 20,
                screen.bottom() - self.PET_SIZE - 60,
            )

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        center_x = self.PET_SIZE // 2
        bob_y = int(self._bob_offset) + self.ANIM_RANGE

        # Shadow
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor(0, 0, 0, 30))
        painter.drawEllipse(center_x - 30, bob_y + 80, 60, 12)

        # Body
        body_color = QColor("#D97757")
        if self._mood == "alert":
            body_color = QColor("#E8553A")
        elif self._mood == "thinking":
            body_color = QColor("#C4916A")

        painter.setBrush(QBrush(body_color))
        painter.setPen(Qt.PenStyle.NoPen)
        body_rect = QRect(center_x - 28, bob_y + 22, 56, 56)
        painter.drawRoundedRect(body_rect, 20, 20)

        # Ears / antenna nubs
        painter.setBrush(QBrush(body_color.darker(110)))
        painter.drawEllipse(center_x - 22, bob_y + 14, 14, 14)
        painter.drawEllipse(center_x + 8, bob_y + 14, 14, 14)

        # Head
        painter.setBrush(QBrush(body_color))
        head_rect = QRect(center_x - 24, bob_y + 16, 48, 44)
        painter.drawEllipse(head_rect)

        # Eyes
        eye_y = bob_y + 30
        painter.setBrush(QBrush(QColor("white")))
        painter.drawEllipse(center_x - 16, eye_y, 12, 12)
        painter.drawEllipse(center_x + 4, eye_y, 12, 12)

        if self._mood == "thinking":
            # Half-closed eyes
            painter.setBrush(QBrush(QColor("#1A1815")))
            painter.drawEllipse(center_x - 13, eye_y + 3, 6, 5)
            painter.drawEllipse(center_x + 7, eye_y + 3, 6, 5)
        else:
            # Normal pupils
            painter.setBrush(QBrush(QColor("#1A1815")))
            painter.drawEllipse(center_x - 13, eye_y + 3, 6, 6)
            painter.drawEllipse(center_x + 7, eye_y + 3, 6, 6)
            # Highlight
            painter.setBrush(QBrush(QColor("white")))
            painter.drawEllipse(center_x - 11, eye_y + 3, 2, 2)
            painter.drawEllipse(center_x + 9, eye_y + 3, 2, 2)

        # Mouth
        pen = QPen(QColor("#5C3D2E"), 2)
        painter.setPen(pen)
        painter.setBrush(Qt.BrushStyle.NoBrush)
        if self._mood == "happy":
            painter.drawArc(center_x - 10, bob_y + 43, 20, 12, 0, -180 * 16)
        elif self._mood == "alert":
            painter.drawLine(center_x - 8, bob_y + 50, center_x + 8, bob_y + 50)
        else:
            painter.drawArc(center_x - 8, bob_y + 46, 16, 10, 0, 180 * 16)

        # Antenna
        painter.setPen(QPen(body_color.darker(115), 2))
        painter.drawLine(center_x, bob_y + 16, center_x, bob_y + 5)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QBrush(QColor("#F5C49A")))
        painter.drawEllipse(center_x - 4, bob_y, 8, 8)

        painter.end()

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self._drag_offset = event.pos()
            self._is_dragging = False

    def mouseMoveEvent(self, event):
        if event.buttons() & Qt.MouseButton.LeftButton:
            self._is_dragging = True
            new_pos = self.mapToGlobal(event.pos()) - self._drag_offset
            self.move(new_pos)

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            if self._is_dragging:
                self.save_position()
                self._is_dragging = False
            else:
                self._toggle_popup()

    def mouseDoubleClickEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            if self._popup and self._popup.isVisible():
                self._popup.hide()
            self.open_main.emit()

    def _toggle_popup(self):
        if self._popup is None:
            self._popup = StatusPopup()

        if self._popup.isVisible():
            self._popup.hide()
            return

        self._popup.update_info(
            self.config.mode, self._study_time,
            self._task_done, self._task_total,
            self._srs_count, self._current_app,
        )
        popup_pos = self.mapToGlobal(QPoint(0, 0))
        popup_pos.setX(popup_pos.x() - 200 + self.PET_SIZE)
        popup_pos.setY(popup_pos.y() - 130)

        screen = QApplication.primaryScreen().availableGeometry()
        if popup_pos.x() < screen.left():
            popup_pos.setX(screen.left() + 4)
        if popup_pos.y() < screen.top():
            popup_pos.setY(screen.top() + 4)

        self._popup.move(popup_pos)
        self._popup.show()
