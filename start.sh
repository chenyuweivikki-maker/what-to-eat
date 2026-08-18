#!/bin/bash
# 吃什么 · 一键启动/停止（守护进程方式，不依赖任何终端会话）
# 用法：
#   ./start.sh       启动（或重启）
#   ./start.sh stop  停止
cd "$(dirname "$0")"

if [ "$1" = "stop" ]; then
  if [ -f server.pid ]; then
    kill "$(cat server.pid)" 2>/dev/null && echo "已停止 (pid $(cat server.pid))"
    rm -f server.pid
  else
    echo "没有运行中的服务器（server.pid 不存在）"
  fi
  exit 0
fi

# 已在运行则先停
if [ -f server.pid ] && kill -0 "$(cat server.pid)" 2>/dev/null; then
  kill "$(cat server.pid)" 2>/dev/null
  sleep 0.5
fi

# 找 node（可能不在 PATH 里）
NODE_BIN="$(command -v node 2>/dev/null)"
if [ -z "$NODE_BIN" ]; then
  for p in /opt/homebrew/bin/node /usr/local/bin/node; do
    [ -x "$p" ] && NODE_BIN="$p" && break
  done
fi
if [ -z "$NODE_BIN" ]; then
  echo "未找到 node，请先安装 Node.js" >&2
  exit 1
fi

nohup "$NODE_BIN" server.js > server.log 2>&1 &
echo $! > server.pid
sleep 1
echo "已启动 (pid $(cat server.pid))"
echo "  本机访问： http://localhost:8899"
grep "手机访问" server.log | head -1
