# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules

hiddenimports = ['pkgutil', 'importlib.metadata', 'importlib.resources', 'psutil', 'requests', 'requests.adapters', 'requests.auth', 'charset_normalizer', 'PyQt6.QtSvgWidgets', 'win32com', 'win32gui', 'win32process', 'win32api', 'win32con', 'pywintypes', 'win32security', 'win32event']
hiddenimports += collect_submodules('common')
hiddenimports += collect_submodules('student')


a = Analysis(
    ['student.py'],
    pathex=[],
    binaries=[],
    datas=[('common', 'common'), ('student', 'student')],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['matplotlib', 'numpy', 'pandas', 'scipy', 'PIL', 'Pillow', 'cv2', 'sklearn', 'tensorflow', 'torch', 'PyQt6.QtWebEngineWidgets', 'PyQt6.QtWebEngineCore', 'PyQt6.QtBluetooth', 'PyQt6.QtNfc', 'PyQt6.QtPositioning', 'PyQt6.QtSensors', 'PyQt6.QtSerialPort', 'unittest', 'test', 'doctest'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='personalac-student',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    version='build/version_info.txt',
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='personalac-student',
)
