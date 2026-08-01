"""原生 Qt 任务面板，供锁定模式主窗口使用"""
import logging
from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QScrollArea, QPushButton, QFrame, QSizePolicy,
)

from common.api import PersonalACApi

logger = logging.getLogger(__name__)

_QSS = """
QWidget#task_panel {
    background: #1C1917;
    border-right: 1px solid rgba(255,255,255,0.06);
}
QLabel#panel_title {
    color: #F9F7F4;
    font-size: 14px;
    font-weight: 700;
    font-family: 'Segoe UI', 'PingFang SC', sans-serif;
}
QLabel#count_badge {
    color: #D97757;
    font-size: 11px;
    font-weight: 600;
    background: rgba(217,119,87,0.15);
    border-radius: 8px;
    padding: 2px 8px;
    font-family: 'Segoe UI', sans-serif;
}
QLabel#empty_hint {
    color: rgba(249,247,244,0.3);
    font-size: 13px;
    font-family: 'Segoe UI', 'PingFang SC', sans-serif;
}
QPushButton#refresh_btn {
    background: transparent;
    border: none;
    color: rgba(249,247,244,0.4);
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Segoe UI', sans-serif;
}
QPushButton#refresh_btn:hover {
    color: #D97757;
    background: rgba(217,119,87,0.1);
}
"""

_TASK_QSS = """
QFrame#task_card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 8px;
    margin: 0px;
}
QFrame#task_card[done="true"] {
    background: rgba(74,222,128,0.05);
    border-color: rgba(74,222,128,0.15);
}
QLabel#task_title {
    color: #F9F7F4;
    font-size: 13px;
    font-family: 'Segoe UI', 'PingFang SC', sans-serif;
}
QLabel#task_title[done="true"] {
    color: rgba(249,247,244,0.35);
    text-decoration: line-through;
}
QPushButton#done_btn {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 5px;
    color: rgba(249,247,244,0.5);
    font-size: 11px;
    padding: 3px 10px;
    min-width: 40px;
    font-family: 'Segoe UI', sans-serif;
}
QPushButton#done_btn:hover {
    background: rgba(74,222,128,0.15);
    border-color: rgba(74,222,128,0.4);
    color: #4ADE80;
}
QPushButton#done_btn[done="true"] {
    background: rgba(74,222,128,0.12);
    border-color: rgba(74,222,128,0.3);
    color: #4ADE80;
}
"""


class _TaskCard(QFrame):
    mark_done = pyqtSignal(str)  # task id

    def __init__(self, task: dict, parent=None):
        super().__init__(parent)
        self.task_id = task.get('id', '')
        self._done = bool(task.get('completed') or task.get('done'))
        self.setObjectName('task_card')
        self.setProperty('done', str(self._done).lower())
        self.setStyleSheet(_TASK_QSS)
        self._build(task)

    def _build(self, task: dict):
        lay = QHBoxLayout(self)
        lay.setContentsMargins(12, 10, 10, 10)
        lay.setSpacing(10)

        # priority dot
        priority = task.get('priority', 'medium')
        dot_color = {'high': '#F87171', 'medium': '#D97757', 'low': '#6B6560'}.get(priority, '#D97757')
        dot = QLabel('●')
        dot.setStyleSheet(f'color: {dot_color}; font-size: 8px; min-width: 10px;')
        lay.addWidget(dot, 0, Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignVCenter)

        title = task.get('title') or task.get('content', '（无标题）')
        self._title_lbl = QLabel(title)
        self._title_lbl.setObjectName('task_title')
        self._title_lbl.setProperty('done', str(self._done).lower())
        self._title_lbl.setWordWrap(True)
        self._title_lbl.setStyleSheet(_TASK_QSS)
        lay.addWidget(self._title_lbl, 1)

        if not self._done:
            self._btn = QPushButton('完成')
            self._btn.setObjectName('done_btn')
            self._btn.setFixedHeight(28)
            self._btn.clicked.connect(lambda: self.mark_done.emit(self.task_id))
            lay.addWidget(self._btn, 0)
        else:
            done_lbl = QLabel('✓')
            done_lbl.setStyleSheet('color: #4ADE80; font-size: 13px; min-width: 20px;')
            done_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            lay.addWidget(done_lbl, 0)

    def set_loading(self, loading: bool):
        if hasattr(self, '_btn'):
            self._btn.setEnabled(not loading)
            self._btn.setText('…' if loading else '完成')


class TaskPanel(QWidget):
    all_done = pyqtSignal()          # 全部必做任务完成
    progress_changed = pyqtSignal(int, int)  # (done, total)

    def __init__(self, api: PersonalACApi, parent=None):
        super().__init__(parent)
        self.api = api
        self.setObjectName('task_panel')
        self.setStyleSheet(_QSS)
        self.setMinimumWidth(240)
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Expanding)
        self.setFixedWidth(300)
        self._tasks: list[dict] = []
        self._cards: list[_TaskCard] = []
        self._build_ui()

        self._refresh_timer = QTimer(self)
        self._refresh_timer.setInterval(30_000)
        self._refresh_timer.timeout.connect(self.refresh)
        self._refresh_timer.start()
        QTimer.singleShot(500, self.refresh)

    def _build_ui(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        # header
        header = QWidget()
        header.setStyleSheet('background: #111009; border-bottom: 1px solid rgba(255,255,255,0.06);')
        h_lay = QHBoxLayout(header)
        h_lay.setContentsMargins(16, 14, 12, 14)
        h_lay.setSpacing(8)

        title = QLabel('今日任务')
        title.setObjectName('panel_title')
        h_lay.addWidget(title)

        self._count_badge = QLabel('')
        self._count_badge.setObjectName('count_badge')
        self._count_badge.hide()
        h_lay.addWidget(self._count_badge)
        h_lay.addStretch()

        refresh_btn = QPushButton('↻')
        refresh_btn.setObjectName('refresh_btn')
        refresh_btn.setFixedSize(28, 28)
        refresh_btn.setToolTip('刷新任务列表')
        refresh_btn.clicked.connect(self.refresh)
        h_lay.addWidget(refresh_btn)

        outer.addWidget(header)

        # scroll area
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setStyleSheet('QScrollArea { border: none; background: transparent; }'
                             'QScrollBar:vertical { width: 4px; background: transparent; }'
                             'QScrollBar::handle:vertical { background: rgba(255,255,255,0.15); border-radius: 2px; }')

        self._list_widget = QWidget()
        self._list_widget.setStyleSheet('background: transparent;')
        self._list_layout = QVBoxLayout(self._list_widget)
        self._list_layout.setContentsMargins(12, 12, 12, 12)
        self._list_layout.setSpacing(8)
        self._list_layout.addStretch()

        self._empty_label = QLabel('暂无必做任务\n好好保持 💪')
        self._empty_label.setObjectName('empty_hint')
        self._empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._empty_label.setContentsMargins(0, 30, 0, 0)
        self._list_layout.insertWidget(0, self._empty_label)

        scroll.setWidget(self._list_widget)
        outer.addWidget(scroll, 1)

        # study timer footer
        footer = QWidget()
        footer.setStyleSheet('background: rgba(0,0,0,0.25); border-top: 1px solid rgba(255,255,255,0.05);')
        f_lay = QHBoxLayout(footer)
        f_lay.setContentsMargins(14, 8, 14, 8)

        self._study_time_lbl = QLabel('今日学习: --')
        self._study_time_lbl.setStyleSheet(
            'color: rgba(249,247,244,0.4); font-size: 11px; '
            "font-family: 'Segoe UI', 'PingFang SC', sans-serif;"
        )
        f_lay.addWidget(self._study_time_lbl)
        f_lay.addStretch()
        outer.addWidget(footer)

    def refresh(self):
        try:
            tasks = self.api.get_mustdo() or []
            must = [t for t in tasks if t.get('mustdo') or t.get('must_do') or t.get('is_must_do')]
            if not must:
                must = tasks  # show all if none flagged as must-do
            self._render_tasks(must)
        except Exception as e:
            logger.warning('TaskPanel refresh failed: %s', e)

    def _render_tasks(self, tasks: list[dict]):
        # clear old cards
        for card in self._cards:
            self._list_layout.removeWidget(card)
            card.deleteLater()
        self._cards.clear()

        self._tasks = tasks
        pending = [t for t in tasks if not (t.get('completed') or t.get('done'))]
        done_count = len(tasks) - len(pending)

        if not tasks:
            self._empty_label.show()
            self._count_badge.hide()
        else:
            self._empty_label.hide()
            remaining = len(pending)
            self._count_badge.setText(f'{remaining} 待完成' if remaining else '全部完成 ✓')
            self._count_badge.setStyleSheet(
                'color: #4ADE80; font-size: 11px; font-weight: 600; '
                'background: rgba(74,222,128,0.12); border-radius: 8px; padding: 2px 8px;'
                if remaining == 0 else
                'color: #D97757; font-size: 11px; font-weight: 600; '
                'background: rgba(217,119,87,0.15); border-radius: 8px; padding: 2px 8px;'
            )
            self._count_badge.show()

            # Insert done tasks at bottom
            sorted_tasks = sorted(tasks, key=lambda t: bool(t.get('completed') or t.get('done')))
            for task in sorted_tasks:
                card = _TaskCard(task)
                card.mark_done.connect(self._on_mark_done)
                self._list_layout.insertWidget(self._list_layout.count() - 1, card)
                self._cards.append(card)

        total = len(tasks)
        self.progress_changed.emit(done_count, total)
        if total > 0 and done_count >= total:
            self.all_done.emit()

    def _on_mark_done(self, task_id: str):
        card = next((c for c in self._cards if c.task_id == task_id), None)
        if card:
            card.set_loading(True)
        try:
            result = self.api._post(f'/api/todos/{task_id}/complete', {})
            if result and result.get('success'):
                self.refresh()
            else:
                if card:
                    card.set_loading(False)
        except Exception as e:
            logger.warning('mark_done failed: %s', e)
            if card:
                card.set_loading(False)

    def update_study_time(self, study_seconds: int):
        h = study_seconds // 3600
        m = (study_seconds % 3600) // 60
        text = f'{h}小时{m}分' if h else (f'{m}分钟' if m else '刚开始')
        self._study_time_lbl.setText(f'今日学习: {text}')
