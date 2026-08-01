@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================
::  PersonalAC - Ollama Vision + SSH Setup
::  Model  : minicpm-v (~8 GB)
::  Ollama : port 11434  LAN direct, bypass Clash/VPN
::  SSH    : port 22     Linux pubkey auth only
:: ============================================================

net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set OLLAMA_PORT=11434
set SSH_PUBKEY=ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJ0jDZO1OKNgBGHvSjmgzpAHjad7f7bpPv9dndYNzhvS personalac-server

echo.
echo ============================================================
echo   PersonalAC Ollama + SSH Setup
echo ============================================================
echo.

:: Step 1: Ollama
echo [1/8] Checking Ollama...
where ollama >nul 2>&1
if %errorLevel% neq 0 (
    echo   Ollama not found, downloading installer...
    powershell -Command "Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile '%TEMP%\OllamaSetup.exe'"
    "%TEMP%\OllamaSetup.exe" /S
    timeout /t 15 /nobreak >nul 2>&1
    where ollama >nul 2>&1
    if errorLevel 1 (
        echo   [ERROR] Ollama install failed. Please install manually and rerun.
        pause & exit /b 1
    )
) else (
    for /f "tokens=*" %%v in ('ollama --version 2^>nul') do echo   Installed: %%v
)

:: Step 2: OLLAMA_HOST — registry + current session
echo [2/8] Setting OLLAMA_HOST=0.0.0.0:%OLLAMA_PORT%...
setx OLLAMA_HOST "0.0.0.0:%OLLAMA_PORT%" /M >nul 2>&1
set OLLAMA_HOST=0.0.0.0:%OLLAMA_PORT%

:: Step 3: Bypass Clash/VPN proxy
echo [3/8] Setting NO_PROXY=* to bypass Clash/VPN...
setx NO_PROXY    "*" /M >nul 2>&1
setx no_proxy    "*" /M >nul 2>&1
setx HTTP_PROXY  ""  /M >nul 2>&1
setx HTTPS_PROXY ""  /M >nul 2>&1
set NO_PROXY=*
set HTTP_PROXY=
set HTTPS_PROXY=

:: Step 4: OpenSSH Server
echo [4/8] Installing OpenSSH Server...
powershell -Command "Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0" >nul 2>&1
sc query sshd >nul 2>&1
if errorLevel 1 (
    echo   [WARN] OpenSSH Server install failed, skipping.
) else (
    sc config sshd start= auto >nul 2>&1
    net start sshd >nul 2>&1
    echo   sshd started and set to auto-start.
)

:: Step 5: SSH pubkey
echo [5/8] Writing SSH public key...
set AUTH_KEYS=C:\ProgramData\ssh\administrators_authorized_keys
if not exist "C:\ProgramData\ssh" mkdir "C:\ProgramData\ssh"
echo %SSH_PUBKEY% > "%AUTH_KEYS%"
icacls "%AUTH_KEYS%" /inheritance:r /grant "SYSTEM:(F)" /grant "Administrators:(F)" >nul 2>&1
echo   Public key written to %AUTH_KEYS%

:: Step 6: Firewall
echo [6/8] Opening firewall ports...
netsh advfirewall firewall add rule name="Ollama LAN" dir=in action=allow protocol=TCP localport=%OLLAMA_PORT% >nul 2>&1
netsh advfirewall firewall add rule name="SSH"        dir=in action=allow protocol=TCP localport=22          >nul 2>&1

:: Step 7: Restart Ollama with new env
echo [7/8] Restarting Ollama (with new OLLAMA_HOST)...
taskkill /f /im ollama.exe >nul 2>&1
timeout /t 3 /nobreak >nul 2>&1
start "" /b ollama serve
timeout /t 5 /nobreak >nul 2>&1

:: Step 8: Pull model
echo [8/8] Pulling model minicpm-v (~8 GB, please wait)...
ollama pull minicpm-v
if errorLevel 1 (
    echo   [ERROR] Model pull failed. Check network and retry: ollama pull minicpm-v
    pause & exit /b 1
)

echo.
echo ============================================================
echo   Done!
echo   Ollama : http://0.0.0.0:%OLLAMA_PORT%
echo   SSH    : enabled, pubkey login ready
echo.
echo   Please tell the Linux side: this machine IP + Windows username.
echo ============================================================
echo.
pause
