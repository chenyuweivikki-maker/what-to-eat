# 🍜 吃什么（健康版）

不知道吃什么的时候用的本地小应用：**转盘 + 健康推荐 + AI 对话**，全程围绕健康目标——少食多餐、清淡优先。仓库内置通用默认档案；本机可用 `profile.local.js` 覆盖成自己的档案（见「想自己改」）。

## ✨ 功能

| 功能 | 说明 |
|---|---|
| 🧭 页面导航 | **首页只有转盘**；饮食记录 / 食谱 / 问问AI 在侧边栏切换（转盘为首页）（手机上侧边栏是 ☰ 滑出的抽屉，桌面上常驻在左侧） |
| 🎡 转盘 | **13 个食物分类扇区**（外卖清淡 / 外卖麦肯 / 面粉饺子 / 自己炒菜 / 火锅冒菜 / 快手汤粥 / 轻食沙拉 / 海鲜蒸菜 / 盖饭杂粮 / 烧烤炸鸡 / 快手早餐 / 日韩料理 / 街边小吃），时段感知（早晚/深夜自动偏向合适扇区）；点「转」出结果 |
| 🍽️ 结果卡片 | 具体菜名 + 热量范围 + 健康提示 + 为什么适合你 + 时段提示 + 少食多餐提示；**自己做类可展开「📖 查看食谱」**（食材 + 步骤 + 时间） |
| 🤖 对话助手 | 先点状态（胃口/饭量/做饭/冰箱，冰箱可**自己添加食材**），再问；AI key 配在**服务端**（无需在页面配置），连不上时自动退回内置规则助手 |
| 🍽️ 少食多餐 | **内置在推荐逻辑里**（不是提醒功能）：默认饭量选「少」、不推荐大分量、大份食物自动拆成两顿、每次推荐附加餐计划 |
| 📒 饮食记录 | 正餐与**🍩 放纵（奶茶甜品）分开记**；⚖️ 体重记录（算离目标体重多远）；**周报每周自动生成** |
| 📊 周报 | 热量估算（正餐 + 放纵分开和合计）、目标进度、类别 Top3、健康提醒 + **🤖 AI 智能分析摄入**（按钮生成，自动周报时自动触发） |
| 💰 外卖比价 | 外卖类推荐附带 30 秒比价清单（美团/饿了么同店比总价、领券技巧） |
| 🍰 甜品（偶尔） | 你偶尔想吃小蛋糕/甜品已写入规则：允许**小份**推荐，但提示频率（每周 ≤1~2 次）和搭配（无糖茶/黑咖啡） |

## 🚀 本地使用

### 方式一：直接打开（最简单）

双击 `index.html`，用浏览器打开。所有数据都在本地，不联网也能用转盘和规则助手。

### 方式二：本地服务器（手机也能用）

```bash
cd /Users/vesper/Desktop/吃什么
node server.js
```

- 电脑浏览器打开：`http://localhost:8899`
- 手机（同一 WiFi）打开：`http://<电脑IP>:8899`（启动时会打印出来）
- 服务器同时提供 LLM 代理 `/chat`，解决浏览器直连 API 被跨域拦截的问题

## ☁️ 部署到云端（手机随时用）

> ⚠️ 重要：浏览器**直连** DeepSeek API 会被 CORS 跨域拦截，所以云端必须带一个「代理」。Vercel/Cloudflare 的域名在国内基本打不开（实测），**推荐 Railway**（railway.app 域名国内可正常访问）。

### 方案 A：Railway（推荐，国内可访问，本项目已在用）

云端地址：**https://chishenme-production.up.railway.app**

改完代码后重新部署（一键）：

```bash
cd /Users/vesper/Desktop/吃什么
./deploy.sh        # 等价于 railway up --service chishenme --yes
```

#### 自动部署（GitHub Actions，推送即部署）

仓库内置了 `.github/workflows/deploy.yml`：每次 `git push` 到 `main` 分支，GitHub 会在云端自动执行 `railway up`，几分钟内云端更新，不用再手动部署（也可以到仓库 **Actions** 页手动点「Run workflow」触发）。

**一次性配置（约 2 分钟）：**

1. 打开 [Railway 后台](https://railway.app/dashboard) → 进入项目 **memo-inbox** → **Settings** → **Tokens**，创建一个 **Project Token**（环境选 `production`）
2. 复制令牌，到 GitHub 仓库 **what-to-eat** → **Settings → Secrets and variables → Actions** → **New repository secret**
3. Name 填 `RAILWAY_TOKEN`，Value 粘贴令牌，保存

之后本地 `git push` 即自动部署。令牌由 GitHub 加密存储，不会出现在代码里；想停用就在 Railway 后台删掉该 token。

> **云端个性化**：个人档案不会进仓库。云端部署后在 Railway → Variables 添加 `PROFILE_OVERRIDE`（JSON 字符串，结构同 `data.js` 顶部 `PROFILE`），`server.js` 会自动注入，手机端就按你的档案推荐；本地则用 `profile.local.js`（见「想自己改」）。

- 免费额度：服务闲置 15 分钟后会休眠，打开页面时自动唤醒（冷启动几秒），不影响使用

### 方案 B：国内云服务器（腾讯云/阿里云轻量，稳定，约 ¥30-60/月）

1. 买一台轻量服务器（最低配即可，系统选 Ubuntu）
2. 把整个目录传到服务器：`scp -r 吃什么 root@服务器IP:/opt/`
3. SSH 上去执行：

```bash
cd /opt/吃什么
DEEPSEEK_API_KEY=你的key nohup node server.js > server.log 2>&1 &
```

4. 在云控制台「防火墙/安全组」放行 TCP **8899** 端口
5. 浏览器访问 `http://服务器IP:8899`（手机同样）

> 用 IP:端口 访问不需要备案；想绑域名走 80/443 才需要备案（腾讯云/阿里云都有备案指引）。

### 手机不部署的临时办法

不出门/懒得部署时：电脑跑 `node server.js`，手机连同一 WiFi 访问打印出来的 IP 即可。

## 🤖 AI 配置（服务端，前端零配置）

AI key 配在**服务端**，页面上没有设置入口（key 不会出现在前端代码里，访客看不到）：

- 本地：在项目目录建一个 `deepseek.key` 文件，里面放 key（会被 gitignore，服务器也拦截该文件不外传）；或启动时带 `DEEPSEEK_API_KEY=xxx node server.js`
- 云端 Railway：网页端 Project → Variables 添加 `DEEPSEEK_API_KEY`，或 `railway variables set DEEPSEEK_API_KEY=xxx`
- key 申请：[platform.deepseek.com](https://platform.deepseek.com) → API Keys（充 10 块钱能用很久）
- 对话时 AI 连不上会自动退回内置规则助手，不影响使用

## 🛡️ 健康红线（写死的规则）

- 默认**不推荐**高油高糖高热量；你**点名**想吃（比如"我想吃炸鸡"）才给，且必须附改装建议（去皮、少酱、无糖、小份）
- 每次推荐附带 1~2 条可执行健康提示
- 蛋白质优先：蛋 / 奶 / 无糖酸奶 / 豆腐 / 鸡胸肉 / 鱼虾
- 支持少食多餐：一顿吃不下就拆两顿，饭后 1~2 小时加餐
- 不追求极端低体重（BMI 低于健康下限也不推荐节食/断食），只帮你在吃对的前提下健康减脂

## 📁 文件结构

```
吃什么/
├── .github/workflows/deploy.yml  GitHub Actions 自动部署到 Railway（推送即部署）
├── index.html        页面（转盘 / 结果卡 / 对话 / 饮食记录 / 侧边栏导航）
├── style.css         样式 v4（小字号楷体风，全站柔和配色）
├── data.js           数据层：档案、13 扇区候选库（加餐/看冰箱隐藏）、健康红线、食谱库、食材清单、周报计算
├── app.js            逻辑层：时段感知转盘、双模式对话、饮食记录与自动周报
├── server.js         本地服务器 + LLM 代理（零依赖，端口 8899）
├── api/chat.js       Vercel LLM 代理（部署后为 /api/chat）
├── functions/chat.js Cloudflare Pages LLM 代理（部署后为 /chat）
└── README.md         本说明
```

## 🛠️ 想自己改

- 加/改食物：编辑 `data.js` 里对应扇区的 `pool` 数组（`n` 名称 / `kcal` 热量 / `tips` 提示 / `how` 做法 / `shop` 店铺 / `big` 大份标记）；食材在 `INGREDIENTS` 里对应
- 改转盘扇区：改 `SECTORS` 数组（`label` / `emoji` / `color` / `pool`）和 `SECTOR_SLOTS`（各扇区适用时段）
- 改自己的档案（身高/体重/目标/胃口/甜品偏好等）：本机在项目目录建 `profile.local.js`（内容见 `data.js` 顶部 `PROFILE` 的结构），会覆盖默认档案且**不会进 GitHub**；直接改 `data.js` 顶部 `PROFILE` 也可以，但那样个人数据会随仓库公开

## 💾 数据存在哪

所有记录都存在**你浏览器本机的 localStorage**（不联网、不上传）：
- `cs:log` 进食记录　·　`cs:stats` 转盘/对话统计　·　`cs:settings` 设置

注意事项：刷新/关浏览器不丢；但**换浏览器、换设备、清除浏览器数据**会清空；`file://` 直接打开和 `http://localhost:8899` 打开是两个独立的存储空间（建议固定用服务器方式打开）。跨设备同步属于后续可做的功能。

## ⚠️ 免责声明

本工具只做日常饮食参考，不构成医疗或营养建议。如果长期食欲差、体重异常下降，建议咨询医生或注册营养师。
