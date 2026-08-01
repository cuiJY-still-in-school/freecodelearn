"""跨平台浏览器当前 URL 获取（带缓存，每 8 秒最多查一次）"""
import logging
import sys
import time

logger = logging.getLogger(__name__)

BROWSER_NAMES = {
    'chrome', 'google chrome', 'chromium', 'msedge', 'microsoft edge',
    'firefox', 'mozilla firefox', 'brave', 'brave browser',
    'opera', 'vivaldi', 'safari', '360se', '360browser',
    'qqbrowser', 'sogouexplorer', '2345explorer',
}


def is_browser(app_name: str) -> bool:
    low = app_name.lower().replace('.exe', '').strip()
    return any(b in low for b in BROWSER_NAMES)


# ── macOS ─────────────────────────────────────────────────────────────────────

_MAC_SCRIPTS: dict[str, str] = {
    'google chrome': 'tell application "Google Chrome" to get URL of active tab of front window',
    'chrome':        'tell application "Google Chrome" to get URL of active tab of front window',
    'chromium':      'tell application "Chromium" to get URL of active tab of front window',
    'safari':        'tell application "Safari" to get URL of current tab of front window',
    'firefox':       'tell application "Firefox" to get URL of active tab of front window',
    'microsoft edge': 'tell application "Microsoft Edge" to get URL of active tab of front window',
    'msedge':        'tell application "Microsoft Edge" to get URL of active tab of front window',
    'brave':         'tell application "Brave Browser" to get URL of active tab of front window',
}


def _get_url_mac(app_name: str) -> str:
    import subprocess
    low = app_name.lower().replace('.exe', '').strip()
    for key, script in _MAC_SCRIPTS.items():
        if key in low:
            try:
                r = subprocess.run(
                    ['osascript', '-e', script],
                    capture_output=True, text=True, timeout=2
                )
                if r.returncode == 0:
                    url = r.stdout.strip()
                    if url.startswith('http'):
                        return url
            except Exception as e:
                logger.debug('mac browser url (%s) failed: %s', app_name, e)
    return ''


# ── Windows UIA ───────────────────────────────────────────────────────────────

_uia_obj = None
_uia_tried = False


def _get_uia():
    global _uia_obj, _uia_tried
    if _uia_tried:
        return _uia_obj
    _uia_tried = True
    try:
        import comtypes.client
        import comtypes.gen.UIAutomationClient as _uiac  # noqa: F401
        _uia_obj = comtypes.client.CreateObject(
            '{FF48DBA4-60EF-4201-AA87-54103EEF594E}',
            interface=comtypes.gen.UIAutomationClient.IUIAutomation
        )
    except Exception as e:
        logger.debug('UIA init failed: %s', e)
    return _uia_obj


def _get_url_windows(hwnd: int) -> str:
    if not hwnd:
        return ''
    try:
        import comtypes.gen.UIAutomationClient as uiac
        uia = _get_uia()
        if not uia:
            return ''
        root = uia.ElementFromHandle(hwnd)
        if not root:
            return ''
        cond = uia.CreatePropertyCondition(
            uiac.UIA_ControlTypePropertyId,
            uiac.UIA_EditControlTypeId
        )
        elements = root.FindAll(uiac.TreeScope_Descendants, cond)
        for i in range(elements.Length):
            el = elements.GetElement(i)
            try:
                name = (el.CurrentName or '').lower()
                if any(k in name for k in ('address', 'omni', '地址', '搜索栏', 'location', 'url')):
                    vp = el.GetCurrentPattern(uiac.UIA_ValuePatternId)
                    if vp:
                        url = vp.QueryInterface(
                            uiac.IUIAutomationValuePattern
                        ).CurrentValue
                        if url and ('.' in url or url.startswith('http')):
                            return url if url.startswith('http') else 'https://' + url
            except Exception:
                continue
    except Exception as e:
        logger.debug('UIA url extraction failed: %s', e)
    return ''


# ── 缓存 ──────────────────────────────────────────────────────────────────────

_cache_app: str = ''
_cache_url: str = ''
_cache_at: float = 0.0
_CACHE_TTL = 8.0


def get_browser_url(app_name: str, hwnd: int = 0) -> str:
    """获取浏览器当前 URL，结果缓存 8 秒"""
    global _cache_app, _cache_url, _cache_at

    if not is_browser(app_name):
        return ''

    now = time.monotonic()
    if app_name == _cache_app and now - _cache_at < _CACHE_TTL:
        return _cache_url

    if sys.platform == 'darwin':
        url = _get_url_mac(app_name)
    elif sys.platform == 'win32':
        url = _get_url_windows(hwnd)
    else:
        url = ''

    _cache_app = app_name
    _cache_url = url
    _cache_at = now
    return url
