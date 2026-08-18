#!/bin/bash
# 吃什么 · 一键部署到 Railway（改完代码后运行）
# 用法：./deploy.sh
cd "$(dirname "$0")"

# 找 node（Railway CLI 依赖）
NODE_BIN="$(command -v node 2>/dev/null)"
if [ -z "$NODE_BIN" ]; then
  for p in /opt/homebrew/bin/node /usr/local/bin/node; do
    [ -x "$p" ] && NODE_BIN="$p" && break
  done
fi
if [ -z "$NODE_BIN" ]; then echo "未找到 node"; exit 1; fi

export PATH="$(dirname "$NODE_BIN"):$PATH"

echo "🚀 部署到 Railway（服务 chishenme）..."
railway up --service chishenme --yes
echo "✅ 完成：https://chishenme-production.up.railway.app"
