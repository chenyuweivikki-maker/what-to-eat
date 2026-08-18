#!/bin/bash
# ============================================================
# 吃什么 · 一键配置 DeepSeek Key
# 用法：双击本文件（macOS 会打开终端自动运行）
# 你的 key 输入时不会显示在屏幕上；
# 只会写入本机 deepseek.key + 同步到 Railway 云端环境变量。
# ============================================================
cd "$(dirname "$0")"

echo ""
echo "🍜 吃什么 · 配置 DeepSeek API Key"
echo "--------------------------------------------"
echo "1. 你的 key 只写进本机 deepseek.key 文件和 Railway 环境变量，"
echo "   不会进入任何聊天记录或第三方。"
echo "2. 输入时屏幕不会显示（正常现象），粘贴后按回车即可。"
echo "--------------------------------------------"
read -rsp "请粘贴你的 Key（sk- 开头）：" KEY
echo ""

KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
if [ -z "$KEY" ]; then
  echo "❌ 没有检测到输入，已取消。"
  read -rsp "按回车关闭窗口..." _
  exit 1
fi

# 1) 写入本地文件
printf '%s\n' "$KEY" > deepseek.key
chmod 600 deepseek.key
echo "✅ 已保存到本机 deepseek.key"

# 2) 同步到 Railway（失败不影响本地）
NODE_BIN="$(command -v node 2>/dev/null)"
if [ -z "$NODE_BIN" ]; then
  for p in /opt/homebrew/bin/node /usr/local/bin/node; do
    [ -x "$p" ] && NODE_BIN="$p" && break
  done
fi
if [ -n "$NODE_BIN" ]; then
  export PATH="$(dirname "$NODE_BIN"):$PATH"
  echo "☁️  正在同步到 Railway 云端（会自动重新部署）..."
  railway variables set DEEPSEEK_API_KEY="$KEY" 2>&1 | tail -2 || true
fi

# 3) 重启本地服务器（读取新 key）
./start.sh stop >/dev/null 2>&1
./start.sh >/dev/null 2>&1

echo ""
echo "🎉 配置完成！"
echo "   本地：   http://localhost:8899"
echo "   手机/云端：https://chishenme-production.up.railway.app"
read -rsp "按回车关闭窗口..." _
