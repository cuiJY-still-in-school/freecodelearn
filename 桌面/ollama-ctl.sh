#!/bin/bash
# ============================================================
#  PersonalAC  —  Ollama Windows 远程控制
#  用法: ./ollama-ctl.sh <命令> [参数]
# ============================================================

SSH_KEY="$HOME/.ssh/personalac_win"
CFG_DIR="$HOME/.config/personalac"
CFG_IP="$CFG_DIR/win_ip"
CFG_USER="$CFG_DIR/win_user"
OLLAMA_PORT=11434

mkdir -p "$CFG_DIR"

_load_cfg() {
    WIN_IP=$(cat "$CFG_IP" 2>/dev/null)
    WIN_USER=$(cat "$CFG_USER" 2>/dev/null)
}

_check_cfg() {
    _load_cfg
    if [[ -z "$WIN_IP" || -z "$WIN_USER" ]]; then
        echo "⚠  还没有配置 Windows 主机，请输入："
        read -rp "    IP 地址  : " WIN_IP
        read -rp "    用户名   : " WIN_USER
        echo "$WIN_IP"   > "$CFG_IP"
        echo "$WIN_USER" > "$CFG_USER"
        echo "✓  已保存。"
    fi
}

_ssh() {
    ssh -i "$SSH_KEY" \
        -o StrictHostKeyChecking=no \
        -o ConnectTimeout=8 \
        -o BatchMode=yes \
        "${WIN_USER}@${WIN_IP}" "$@"
}

_api() {
    curl -sf --max-time 10 "http://${WIN_IP}:${OLLAMA_PORT}${1}"
}

# ── 命令 ────────────────────────────────────────────────
cmd_status() {
    echo "── Ollama ($WIN_IP:$OLLAMA_PORT) ──"
    _api "/api/tags" >/dev/null 2>&1 \
        && echo "✓  Ollama 运行正常" \
        || echo "✗  Ollama 无响应"

    echo "── SSH ($WIN_IP:22) ──"
    _ssh "echo ok" >/dev/null 2>&1 \
        && echo "✓  SSH 正常" \
        || echo "✗  SSH 无法连接"
}

cmd_models() {
    echo "── 已安装模型 ──"
    _api "/api/tags" | python3 -c "
import sys,json
d=json.load(sys.stdin)
models=d.get('models',[])
[print(f\"  {m['name']:<42s}  {m['size']//1024**3:.1f} GB\") for m in models] or print('  (空)')
" 2>/dev/null
}

cmd_ps() {
    echo "── 内存中的模型 ──"
    _api "/api/ps" | python3 -c "
import sys,json
d=json.load(sys.stdin)
models=d.get('models',[])
[print(f\"  {m['name']}\") for m in models] or print('  (无)')
" 2>/dev/null
}

cmd_pull() {
    [[ -z "$1" ]] && echo "用法: $0 pull <模型名>" && exit 1
    echo "拉取 $1 （SSH，直连无代理）..."
    _ssh "set HTTP_PROXY=& set HTTPS_PROXY=& set NO_PROXY=*& ollama pull $1"
}

cmd_rm() {
    [[ -z "$1" ]] && echo "用法: $0 rm <模型名>" && exit 1
    echo "删除 $1 ..."
    _ssh "ollama rm $1"
}

cmd_restart() {
    echo "重启 Ollama..."
    _ssh 'taskkill /F /IM ollama.exe & timeout /t 2 /nobreak & start /min cmd /c "set HTTP_PROXY=& set HTTPS_PROXY=& set NO_PROXY=*& set OLLAMA_HOST=0.0.0.0:11434& ollama serve"'
    echo "等待启动..."
    sleep 6
    _api "/api/tags" >/dev/null 2>&1 && echo "✓  Ollama 已恢复" || echo "⚠  稍后 status 再试"
}

cmd_reboot() {
    echo "⚠  即将重启 Windows（30 秒后执行）..."
    read -rp "    确认? [y/N] " c
    [[ "$c" =~ ^[Yy]$ ]] || { echo "取消"; exit 0; }
    _ssh 'shutdown /r /t 30 /c "PersonalAC reboot"'
    echo "✓  已发送重启指令"
}

cmd_ssh() {
    if [[ $# -eq 0 ]]; then
        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${WIN_USER}@${WIN_IP}"
    else
        _ssh "$@"
    fi
}

cmd_set() {
    case "$1" in
        ip)   [[ -z "$2" ]] && read -rp "新 IP: " _v || _v="$2"; echo "$_v" > "$CFG_IP";   echo "✓  IP = $_v" ;;
        user) [[ -z "$2" ]] && read -rp "新用户名: " _v || _v="$2"; echo "$_v" > "$CFG_USER"; echo "✓  用户名 = $_v" ;;
        *)    echo "用法: $0 set ip <地址>  |  $0 set user <用户名>" ;;
    esac
}

cmd_help() {
    cat <<'EOF'

  PersonalAC Ollama 远程控制

  首次配置
    set ip <IP>         保存 Windows IP
    set user <用户名>   保存 Windows 用户名

  状态检查
    status              检查 Ollama + SSH 是否在线

  模型管理
    models              列出已安装模型
    ps                  查看内存中的模型
    pull <model>        拉取/更新模型（走 SSH，无代理）
    rm   <model>        删除模型

  服务控制
    restart             重启 Ollama（不重启系统）
    reboot              重启 Windows 机器

  Shell
    ssh                 打开交互式终端
    ssh <命令>          执行单条 Windows 命令

EOF
}

# ── 入口 ────────────────────────────────────────────────
CMD="$1"; shift

[[ "$CMD" == "set" ]] && { cmd_set "$@"; exit 0; }
[[ "$CMD" == "help" || -z "$CMD" ]] && { cmd_help; exit 0; }

_check_cfg

case "$CMD" in
    status)         cmd_status ;;
    models|list)    cmd_models ;;
    ps|running)     cmd_ps ;;
    pull)           cmd_pull "$@" ;;
    rm|delete)      cmd_rm "$@" ;;
    restart)        cmd_restart ;;
    reboot)         cmd_reboot ;;
    ssh)            cmd_ssh "$@" ;;
    *)              echo "未知命令: $CMD"; cmd_help; exit 1 ;;
esac
