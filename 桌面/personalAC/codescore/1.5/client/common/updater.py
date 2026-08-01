"""版本检查与自动更新提示"""
import logging
import threading
from typing import Callable

logger = logging.getLogger(__name__)

# 与 build.py 保持同步
CURRENT_VERSION = (1, 5, 2)


def _parse_version(v: str) -> tuple[int, ...]:
    try:
        return tuple(int(x) for x in v.strip().lstrip('v').split('.'))
    except Exception:
        return (0,)


def check_update_async(api, on_update: Callable[[str, str], None]) -> None:
    """在后台线程检查服务端是否有新版本，发现更新时调用 on_update(version, download_url)"""
    def _run():
        try:
            info = api._get('/api/download/version')
            if not info or not info.get('success'):
                return
            data = info.get('data') or info
            latest = data.get('version', '')
            url = data.get('url', '')
            if latest and url and _parse_version(latest) > CURRENT_VERSION:
                logger.info('New version available: %s', latest)
                on_update(latest, url)
        except Exception as e:
            logger.debug('update check failed: %s', e)

    threading.Thread(target=_run, daemon=True).start()
