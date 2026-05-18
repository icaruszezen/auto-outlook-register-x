# GUI 重构开发计划：PyQt6 → Next.js

> 目标：在**完全保留** Python 业务逻辑（`core/`、`database/`、`utils/`、`config/`）的前提下，仅替换前端 GUI，从 PyQt6 迁移到 Next.js + shadcn/ui，提升界面美观度与可维护性。
>
> 原则：
> - **一行 Python 业务代码不动**，只在 Python 侧加一层 API 封装
> - 现有 Qt 界面的所有功能 1:1 迁移
> - 保持单文件 EXE 打包能力（开发期可分开跑，发布期合并）

---

## 一、当前 Qt 界面功能清单（需要 1:1 迁移）

| 主 Tab | 子模块 | 关键功能 |
|--------|--------|----------|
| 📧 自动注册 | 单一页 | 启动/停止注册、实时日志、账号表格、点击行查看历史日志、删除账号、跳转监听 |
| 📬 邮件监听 | 单一页 | 输入邮箱密码、间隔、API/浏览器模式切换、收件箱表格、邮件正文预览、实时刷新 |
| 📋 账号管理 | 单一页 | 统计卡片、账号表格、刷新/导出/复制/清空 |
| 🗂️ 数据管理 | 🎯 Augment | 立即注册、提取账号信息、绑定卡片、代理配置（含弹窗）、账号表格、日志控制台 |
| 🗂️ 数据管理 | 📧 邮箱管理 | 三种生成模式（顺序/随机/固定）、批量生成、邮箱列表表格、删除/清空、导入 Outlook 账号 |
| 🗂️ 数据管理 | 👤 用户信息 | 随机生成/手动输入、用户表格（姓名/邮编/县/地区/地址/电话）、删除/清空 |
| 🗂️ 数据管理 | 💳 卡片信息 | 虚拟卡生成（BIN/月/年/CVV）/手动输入、脱敏表格、删除/清空 |
| 弹窗交互 | - | 注册过程中的「需手动操作确认」、「注册结果确认」、「删除二次确认」、「关闭浏览器确认」 |

**注册过程的特殊交互**（必须保留）：
1. Python 注册流程会通过 `confirm_callback` / `confirm_success_callback` 回调阻塞等待用户在 UI 上确认
2. 注册完成后会等待用户点确定再关闭浏览器（`browser_close_done`）
3. 这些阻塞回调在新架构下需要通过 **WebSocket 双向通信** 实现

---

## 二、目标架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       桌面应用窗口（pywebview）                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │             Next.js 前端 (http://127.0.0.1:3535)         │   │
│  │   App Router · TypeScript · Tailwind · shadcn/ui · SWR   │   │
│  └────────────────┬─────────────────────────────────────────┘   │
│                   │ REST API + WebSocket                         │
│  ┌────────────────▼─────────────────────────────────────────┐   │
│  │           FastAPI 后端 (http://127.0.0.1:8765)           │   │
│  │   api/ 路由层  →  service/ 适配层  →  现有 core/utils/db │   │
│  └────────────────┬─────────────────────────────────────────┘   │
│                   │  零修改                                       │
│  ┌────────────────▼─────────────────────────────────────────┐   │
│  │  现有 Python 业务（core/ database/ utils/ config/）       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 技术栈

**后端新增依赖**（追加到 `requirements.txt`）：
- `fastapi>=0.110` · `uvicorn[standard]>=0.27` · `websockets>=12` · `pydantic>=2.6`
- `pywebview>=5.0`（桌面壳）

**前端**（新建 `webgui/` 目录）：
- Next.js 15 App Router · React 19 · TypeScript 5
- Tailwind CSS 4 · shadcn/ui · lucide-react · sonner（toast）
- SWR（数据请求）· zustand（轻量状态）· `socket.io-client` 或原生 WebSocket
- TanStack Table（账号/邮件表格）

### 目录改造（最终形态）

```
auto-outlook-register/
├── main.py                    # 改为：启动 FastAPI + pywebview
├── api/                       # 【新增】FastAPI 路由层（薄壳）
│   ├── __init__.py
│   ├── server.py              # FastAPI app 装配
│   ├── routes/
│   │   ├── outlook.py         # /api/outlook/*
│   │   ├── monitor.py         # /api/monitor/*
│   │   ├── augment.py         # /api/augment/*
│   │   ├── data.py            # /api/data/* (邮箱/用户/卡片)
│   │   └── proxy.py           # /api/proxy/*
│   ├── ws/
│   │   ├── register_ws.py     # 注册过程 WebSocket（含双向确认）
│   │   └── monitor_ws.py      # 邮件监听 WebSocket
│   └── schemas.py             # Pydantic 模型
├── service/                   # 【新增】业务适配层（把 Qt 的 Worker 翻译成异步 service）
│   ├── register_service.py
│   ├── monitor_service.py
│   ├── data_service.py
│   └── confirm_bus.py         # 用户确认信号总线
├── core/                      # 【保持不变】
├── database/                  # 【保持不变】
├── utils/                     # 【保持不变】
├── config/                    # 【保持不变】
├── gui/                       # 【保留作为对照参考，最后删除】
├── webgui/                    # 【新增】Next.js 项目
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx           # 主框架（侧边栏+内容区）
│   │   ├── (tabs)/
│   │   │   ├── register/page.tsx
│   │   │   ├── monitor/page.tsx
│   │   │   ├── accounts/page.tsx
│   │   │   └── data/
│   │   │       ├── augment/page.tsx
│   │   │       ├── emails/page.tsx
│   │   │       ├── users/page.tsx
│   │   │       └── cards/page.tsx
│   ├── components/
│   │   ├── ui/                # shadcn 生成
│   │   ├── log-console.tsx
│   │   ├── account-table.tsx
│   │   ├── confirm-dialog.tsx
│   │   └── ...
│   ├── lib/
│   │   ├── api.ts             # fetch 封装
│   │   └── ws.ts              # WebSocket 封装
│   └── package.json
└── requirements.txt
```

---

## 三、阶段划分

| 阶段 | 内容 | 产出 | 预估 |
|------|------|------|------|
| **P0** | 项目骨架（FastAPI + Next.js + pywebview 联通） | 能从 Next.js 调用 Python 的 `/api/health` | 0.5d |
| **P1** | API 适配层（把现有功能全部暴露成 HTTP/WS） | 后端 API 完整，可用 curl/Postman 验证 | 2d |
| **P2** | 前端通用框架（布局、主题、通用组件） | 侧边栏 + Tab 切换 + 暗色主题 + 通用表格 | 1d |
| **P3** | 自动注册 Tab（含 WebSocket 双向确认） | 完整功能 | 1.5d |
| **P4** | 邮件监听 Tab | 完整功能 | 1d |
| **P5** | 账号管理 Tab | 完整功能 | 0.5d |
| **P6** | 数据管理 Tab（4 个子 Tab） | 完整功能 | 2d |
| **P7** | 代理配置弹窗 + 杂项弹窗 | 完整功能 | 0.5d |
| **P8** | 打包：pywebview + Next.js 静态导出 + PyInstaller | 单文件 EXE/APP | 1d |
| **P9** | 删除旧 PyQt6 代码、收尾 | 仓库瘦身 | 0.5d |

---

## 四、详细步骤 + 开发提示词（Prompt）

> 每一步的 Prompt 都设计为可以**直接复制给 Claude / 其他 AI 编程助手**，独立完成该步骤。

---

### P0-1：搭建 FastAPI 骨架

**任务**：在项目根目录新增 `api/` 包，启动一个能跑的 FastAPI server，与现有 Python 模块共存。

**开发 Prompt**：
```
在现有项目（auto-outlook-register）根目录新增 api/ 包，搭建 FastAPI 骨架。要求：

1. 新增依赖到 requirements.txt：
   fastapi>=0.110, uvicorn[standard]>=0.27, websockets>=12, pydantic>=2.6, pywebview>=5.0

2. 创建 api/server.py：
   - 创建 FastAPI app 实例，title="OutlookRegister API"
   - 挂载 CORS（允许 http://127.0.0.1:3535 和 file://）
   - 定义 GET /api/health → {"status":"ok","version":Settings.APP_VERSION}
   - 定义 GET /api/app-info → {"name":..., "version":..., "data_dir":...}
   - 写一个 run_server(host="127.0.0.1", port=8765) 函数

3. 不要修改现有 main.py、core/、gui/ 任何文件。
4. 新增 api/__init__.py 暴露 run_server。
5. 新增一个 api/dev_run.py，里面调用 run_server() 用于开发期测试。

测试方式：python -m api.dev_run，然后 curl http://127.0.0.1:8765/api/health 应该返回 ok。
```

---

### P0-2：搭建 Next.js 骨架

**任务**：在项目根目录新建 `webgui/`，初始化 Next.js 15 + shadcn/ui。

**开发 Prompt**：
```
在 auto-outlook-register/webgui/ 下初始化 Next.js 项目，要求：

1. 使用以下命令初始化（在 webgui/ 目录里执行）：
   npx create-next-app@latest . --typescript --tailwind --app --src-dir --turbopack --import-alias "@/*" --no-eslint
   注意：项目根目录已有内容时使用 . 创建到当前目录，--use-npm 视情况加上。

2. 修改 webgui/package.json：
   - "dev" 脚本改为 next dev -p 3535 -H 127.0.0.1
   - 添加 "build:export" 脚本：next build（next.config.ts 设置 output: 'export'）

3. 安装并初始化 shadcn/ui：
   npx shadcn@latest init -d
   预先添加常用组件：button card dialog input label select separator sonner switch table tabs textarea toast tooltip badge alert-dialog
   命令：npx shadcn@latest add button card dialog input label select separator sonner switch table tabs textarea tooltip badge alert-dialog

4. 安装额外依赖：
   npm i swr zustand lucide-react @tanstack/react-table

5. 创建 webgui/src/lib/api.ts，封装 fetch：
   - 基础 URL 来自 NEXT_PUBLIC_API_BASE，默认 http://127.0.0.1:8765
   - 导出 apiGet / apiPost / apiDelete，自动 JSON 化、抛错

6. 创建 webgui/src/lib/ws.ts，封装 WebSocket 客户端类（带自动重连、消息回调）。

7. 修改 webgui/src/app/page.tsx，做最简首页：调用 GET /api/health 显示后端版本，验证联通。

8. 在 webgui/.env.local 写：NEXT_PUBLIC_API_BASE=http://127.0.0.1:8765

测试：先启动 python -m api.dev_run，再 cd webgui && npm run dev，访问 http://127.0.0.1:3535 应能看到 "ok" 和版本号。
```

---

### P0-3：pywebview 桌面壳

**任务**：让 `python main.py` 同时启动 FastAPI server 和一个 pywebview 窗口，加载 Next.js dev server（开发期）或静态资源（打包后）。

**开发 Prompt**：
```
改造 main.py，从 PyQt6 切换到 pywebview，用于承载 Next.js 前端。要求：

1. 备份现有 main.py 为 main_pyqt_legacy.py（保留以防回退）。

2. 重写 main.py：
   - 在后台线程启动 api.server.run_server()
   - 等待端口 8765 可用（最多 10s）
   - 用 pywebview 创建窗口：
     · title = Settings.APP_NAME
     · 大小 1280x860，可缩放
     · 开发模式（os.getenv("OUTLOOK_DEV") == "1"）：url = http://127.0.0.1:3535
     · 生产模式：url = file://.../webgui/out/index.html
     · debug=False（生产）
   - 保留 multiprocessing.freeze_support()

3. 加一个 run.bat / run.sh 同名文件更新版（不要改名），先 cd 到项目根，然后：
   - 检查 webgui/node_modules 不存在则提示 "请先 cd webgui && npm install"
   - 设置 OUTLOOK_DEV=1
   - 后台启动 cd webgui && npm run dev
   - 启动 python main.py
   - 退出时杀掉 npm 进程

4. 不要修改 gui/、core/、utils/、database/、config/ 任何文件。

测试：双击 run.bat 应该弹出 pywebview 窗口，加载 Next.js 首页，看到后端 health 信息。
```

---

### P1-1：API 路由 - Outlook 注册

**任务**：把 `gui/register_tab.py` 的 `RegisterWorker` 翻译成异步 service + WebSocket 接口。

**开发 Prompt**：
```
新增 service/register_service.py 和 api/ws/register_ws.py，把 Outlook 注册流程暴露为 WebSocket 接口。要求：

1. 阅读理解 gui/register_tab.py 里的 RegisterWorker 类，特别是：
   - progress / finished / need_confirm / request_close_browser / need_confirm_success 五个信号
   - confirm_done / browser_close_done / confirm_success_done 三个回调
   - 调用的是 core.outlook.outlook_register.OutlookRegistration

2. 新增 service/confirm_bus.py：
   - 一个 ConfirmBus 类，提供 wait_for(key) → 阻塞等待，set(key, value) → 唤醒
   - 内部用 asyncio.Event 或 threading.Event + asyncio.run_in_executor 桥接

3. 新增 service/register_service.py：
   - 类 OutlookRegisterService(websocket)
   - 方法 async start()：在线程池里跑 OutlookRegistration.register()
   - progress_callback: 把消息以 {"type":"log","message":...} 推到 ws
   - confirm_callback(message): 推 {"type":"need_confirm","message":...}，等 ws 回 {"type":"confirm_done"}
   - confirm_success_callback(message): 推 {"type":"need_confirm_success","message":...}，等 ws 回 {"type":"confirm_success","success":bool}
   - 注册结束推 {"type":"finished","success":bool,"user_info":...}
   - 等待 ws 回 {"type":"close_browser"} 后调用 registrar.close()
   - 同时把日志通过 utils.log_manager.LogManager.append_log(email, msg) 持久化

4. 新增 api/ws/register_ws.py：
   - WebSocket 路由 /ws/register
   - 接受连接后实例化 OutlookRegisterService(ws) 并 start

5. 在 api/server.py 注册 ws 路由。

6. 同时新增 REST 路由 api/routes/outlook.py：
   - GET /api/outlook/accounts → 返回 FileManager.load_accounts()
   - DELETE /api/outlook/accounts/{email} → 删账号 + LogManager.delete_log
   - GET /api/outlook/accounts/{email}/log → 返回 LogManager.load_log(email)

不修改 core/、utils/、gui/。

验收：用 wscat 或浏览器连 ws://127.0.0.1:8765/ws/register，应能收到日志流；REST 接口用 curl 验证。
```

---

### P1-2：API 路由 - 邮件监听

**开发 Prompt**：
```
新增 service/monitor_service.py 和 api/ws/monitor_ws.py，对应 gui/monitor_tab.py 的 MonitorWorker。

1. 阅读 gui/monitor_tab.py 的 MonitorWorker，理解：
   - 浏览器模式 _run_browser_mode（用 OutlookEmailMonitor）
   - API 模式 _run_api_mode（用 OutlookAPIMonitor + TokenManager）
   - 进度信号 progress、新邮件信号 new_emails

2. 新增 service/monitor_service.py：
   - 类 MonitorService(ws)
   - async start(email, password, interval=30, use_api=False)：在线程池跑监听循环
   - 推送消息：
     · {"type":"log","message":...}
     · {"type":"emails","items":[{from,subject,date,body}]}
     · {"type":"finished","success":bool,"message":...}
   - 接收 ws 入站 {"type":"stop"} → 停止监听

3. 新增 api/ws/monitor_ws.py，路由 /ws/monitor，握手时从查询参数读 email/password/interval/use_api。

4. 在 api/server.py 注册。

不修改 core/、utils/、gui/。

验收：wscat 连 ws://127.0.0.1:8765/ws/monitor?email=...&password=...&interval=30&use_api=false 能收到邮件流。
```

---

### P1-3：API 路由 - 账号管理 & 数据管理 & 代理

**开发 Prompt**：
```
新增 api/routes/data.py、api/routes/proxy.py、api/routes/augment.py，把 gui/accounts_tab.py、gui/data_management_tab.py、gui/augment_tab.py 的数据操作暴露为 REST API。

1. api/routes/data.py（对应 DataManagementTab 的邮箱/用户/卡片管理）：
   - GET /api/data/emails?status=unused 列表
   - POST /api/data/emails/generate 生成邮箱（body: {mode, prefix, suffix, count, start_number, fixed_emails}）
   - DELETE /api/data/emails/{id}
   - DELETE /api/data/emails 清空
   - POST /api/data/emails/import-outlook 从 outlook 账号导入
   - 用户和卡片接口同理：/api/data/users、/api/data/cards
     · users 支持 mode=random/manual + count + manual_text
     · cards 支持 mode=random/manual + bin/month/year/cvv/count + manual_text
   - 直接复用 utils.email_generator/user_generator/card_generator + database.DatabaseManager

2. api/routes/augment.py（对应 AugmentTab）：
   - GET /api/augment/accounts → AugmentDBManager().get_all_accounts()
   - POST /api/augment/register → 启动注册（异步，立即返回 task_id）
   - DELETE /api/augment/accounts/{id}
   - GET /ws/augment-register（WebSocket，类似 register_ws，转发 RegisterFactory 流程的日志）
   - POST /api/augment/extract-info、POST /api/augment/bind-card 占位

3. api/routes/proxy.py（对应 ProxyConfigDialog）：
   - GET /api/proxy/list → AugmentDBManager().get_all_proxies()
   - POST /api/proxy/add（body: {proxy_strings: string[]}） → 解析+检测+入库
   - POST /api/proxy/{id}/redetect → ProxyDetector.detect_proxy_info
   - DELETE /api/proxy/{id}
   - DELETE /api/proxy → 清空
   - POST /api/proxy/select（body: {id}） → 切换当前使用的代理
   - GET /api/proxy/status → 当前 proxy_manager 状态

4. api/routes/outlook.py 已存在，确认 /api/outlook/accounts/export 接口（返回 accounts.txt 流）也加上。

5. 所有路由在 api/server.py 通过 app.include_router 注册。

6. 用 Pydantic 在 api/schemas.py 定义请求和响应模型，做好类型校验。

不修改 core/、utils/、database/、gui/。

验收：所有接口用 curl 或 Postman 跑通，响应符合预期。
```

---

### P2-1：Next.js 通用布局与主题

**开发 Prompt**：
```
为 webgui/ 搭建主框架。要求：

1. 在 webgui/src/app/layout.tsx：
   - 引入 sonner Toaster
   - 默认浅色主题，但通过 next-themes 支持系统跟随和暗色切换（npm i next-themes）
   - 全局字体用 Geist / Inter

2. 在 webgui/src/app/page.tsx 改造为应用主壳：
   - 左侧固定侧边栏（240px）：Logo + 5 个导航项（自动注册 / 邮件监听 / 账号管理 / 数据管理（含 4 个子项展开）/ 关于）
   - 顶部细 header：当前页标题 + 主题切换按钮 + 后端连接状态指示灯（绿/红圆点 + 文本）
   - 主体内容区域用 Next.js 嵌套路由（使用 (tabs) 路由分组）
   - 底部状态栏：仿 Qt 状态栏，显示最近一条全局通知

3. 创建以下页面占位（每个页面只需返回 <h1>{tab name}</h1>）：
   - app/(tabs)/register/page.tsx
   - app/(tabs)/monitor/page.tsx
   - app/(tabs)/accounts/page.tsx
   - app/(tabs)/data/augment/page.tsx
   - app/(tabs)/data/emails/page.tsx
   - app/(tabs)/data/users/page.tsx
   - app/(tabs)/data/cards/page.tsx

4. 创建 components/connection-status.tsx：
   - 每 5s 调一次 /api/health
   - 渲染绿色/红色圆点 + "已连接 v1.0.0" / "连接断开"

5. 创建 components/log-console.tsx：
   - 受控组件 props: lines: string[]; onClear?: () => void
   - 单色等宽字体、自动滚动到底部、最多保留 1000 行
   - 顶部右上角"清空"按钮
   - 不同前缀（✅⚠️❌🚀）显示不同颜色（用 tailwind colors）

6. 创建 components/data-table.tsx：
   - 用 @tanstack/react-table 封装
   - 支持列定义、排序、行选择、自定义行操作按钮、空状态、加载状态

7. 创建 lib/store.ts（zustand）：
   - 全局 statusBar 文本
   - 全局 toast 历史

不要实现具体业务，先把骨架打好、视觉清爽。

验收：页面能切换、连接状态指示灯随后端启停变化、暗色主题切换流畅。
```

---

### P2-2：WebSocket Hook

**开发 Prompt**：
```
在 webgui/src/lib/ 增加：

1. lib/use-ws.ts：自定义 React Hook
   - useWS<TIn, TOut>(path: string, opts?: { autoConnect?: boolean; query?: Record<string,string> })
   - 返回 { status, lastMessage, send, connect, disconnect, messages }
   - status: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
   - 自动 JSON 解析；断线重连（指数退避，最多 5 次）
   - 在组件卸载时自动断开

2. types/ws.ts：定义所有 ws 消息的 TypeScript 类型，按命名空间组织：
   - RegisterWS.IncomingMessage（log/need_confirm/need_confirm_success/finished）
   - RegisterWS.OutgoingMessage（confirm_done/confirm_success/close_browser/stop）
   - MonitorWS.* / AugmentWS.*

3. 用法示例写到 webgui/src/app/(tabs)/register/page.tsx 顶部注释里。
```

---

### P3：自动注册 Tab

**开发 Prompt**：
```
实现 webgui/src/app/(tabs)/register/page.tsx，对应原 gui/register_tab.py 的全部功能。

布局（用 shadcn/ui）：
- 顶部一行：[🚀 开始注册]（绿色主按钮）[⏹ 停止] 按钮
- 下方左右分栏（ResizablePanelGroup）：
  · 左侧（60%）："已注册账号列表"，DataTable 显示 5 列（邮箱/密码/注册时间/状态/操作）
    - 状态列：Badge 形式，已注册=绿，未注册=橙
    - 操作列：📬 监听（按钮）、🗑️ 删除（按钮，二次确认 AlertDialog）
    - 点击行 → 右侧切换到该账号的历史日志
    - 列表下方："🔄 刷新"按钮
  · 右侧（40%）："📝 注册日志 - 实时" 或 "📝 注册日志 - {email}"
    - 用 LogConsole 组件
    - 底部"🗑️ 清空日志"按钮

数据流：
1. 进入页面 GET /api/outlook/accounts，渲染表格
2. 点"开始注册"：
   - useWS('/ws/register') 建连
   - 收到 log → push 到日志 state
   - 收到 need_confirm → 弹 AlertDialog（含 message），用户点确定后 send({type:'confirm_done'})
   - 收到 need_confirm_success → 弹 AlertDialog（Yes/No 按钮），send({type:'confirm_success', success:bool})
   - 收到 finished → toast 成功/失败弹窗，确定后 send({type:'close_browser'})；刷新账号列表
3. 点"停止" → send({type:'stop'})；ws 关闭后恢复按钮状态
4. 点表格里"📬 监听" → 用 next/navigation 跳到 /monitor，把 email/password 通过 zustand 临时 store 传递（避免放 URL 暴露密码）
5. 点行选中 → GET /api/outlook/accounts/{email}/log，渲染到右侧 LogConsole

注意：
- 注册过程中按钮状态切换（开始 disabled / 停止 enabled）
- 日志区检测到 "📧 生成邮箱:" 时把当前注册邮箱记下（用于标题切换）
- 不要把密码放到 URL 或 localStorage，只用 zustand 内存

验收：
- 完整跑一次注册流程（包括确认弹窗）
- 跑完后表格自动刷新出新账号
- 点账号行能看到历史日志
- 删除账号能正确从后端、日志文件移除
```

---

### P4：邮件监听 Tab

**开发 Prompt**：
```
实现 webgui/src/app/(tabs)/monitor/page.tsx，对应原 gui/monitor_tab.py。

布局：
- 顶部一行表单（使用 Card 包裹）：
  · 邮箱 Input、密码 Input（type=password）、间隔 NumberInput（10-300）、Switch "API 模式"
  · [📬 开始监听]、[⏹ 停止]
- 主体上下分栏：
  · 上部："📬 收件箱" - DataTable 3 列（发件人 / 主题 / 时间）
    - 点击行 → 下部预览
  · 下部："📄 邮件内容" - 等宽字体只读区域

数据流：
1. 从 zustand store 读取 register tab 传来的 email/password 自动填充
2. 点"开始监听" → useWS('/ws/monitor', { query: { email, password, interval, use_api }})
   - 收到 log → 追加到一个 LogConsole（放在邮件内容下方或单独 collapsible 区）
   - 收到 emails → unshift 到表格
   - 收到 finished → toast + 重置按钮
3. 表格行点击 → 下方显示 from / subject / date / body
4. 停止 → send({type:'stop'})

视觉细节：
- 表格头粘性
- 邮件内容区域可缩放（ResizablePanelGroup）
- 加载状态（连接中、获取中）用 Skeleton 占位

验收：API 模式和浏览器模式都能跑通；新邮件能实时进表格。
```

---

### P5：账号管理 Tab

**开发 Prompt**：
```
实现 webgui/src/app/(tabs)/accounts/page.tsx，对应原 gui/accounts_tab.py。

布局：
- 顶部 3 个统计 Card：总数 / 已注册 / 未注册（图标 + 数字 + 颜色）
- 主体 DataTable 5 列：状态 / 邮箱 / 密码 / 生日 / 创建时间
  - 状态列：Badge
  - 支持多行选中（行首 Checkbox）
- 底部按钮：
  · [🔄 刷新] [📤 导出] [📋 复制选中] [🗑️ 清空]

数据流：
1. 进入页面 GET /api/outlook/accounts → 表格 + 统计
2. 导出：调 GET /api/outlook/accounts/export 返回文件流，用 a[download] 触发下载
3. 复制选中：拼接文本 → navigator.clipboard.writeText → toast
4. 清空：AlertDialog 确认 → DELETE /api/outlook/accounts → 刷新

验收：所有按钮功能正常；切换 Tab 离开再回来能保持状态或自动刷新。
```

---

### P6-1：数据管理 - Augment 子 Tab

**开发 Prompt**：
```
实现 webgui/src/app/(tabs)/data/augment/page.tsx，对应原 gui/augment_tab.py。

布局：
- 上半部分（Card "操作面板"）：3x3 网格按钮
  [🚀 立即注册] [📥 提取账号信息] [💳 绑定卡片]
  [🔄 刷新列表] [🗑️ 清空日志]   [⛔ 停止]
  [🌐 代理配置]                  [代理状态：✅ 已配置 (3 个) ]（占两格，颜色绿/红）
- 中部"日志控制台"（Card）：用 LogConsole（高度 200px）
- 下部"账号列表"（Card "账号列表"）：
  · 顶部统计：总数 / 已注册 / 已绑卡
  · DataTable 8 列：ID/邮箱/Tenant URL/Credits/Plan/绑卡状态/注册时间/操作（删除）

数据流：
1. 页面进入：GET /api/augment/accounts、GET /api/proxy/status
2. 立即注册：useWS('/ws/augment-register') → 同 register tab 模式但日志带 level（info/warning/error 分色）
3. 代理配置按钮 → 打开 ProxyDialog 组件（见 P7）
4. 刷新列表 → 重新 GET
5. 删除 → AlertDialog 确认 → DELETE → 刷新

验收：注册流程能跑通；代理状态实时反映。
```

---

### P6-2：数据管理 - 邮箱 / 用户 / 卡片子 Tab

**开发 Prompt**：
```
实现以下三个页面，结构都是"上面生成器 + 下面列表"：

webgui/src/app/(tabs)/data/emails/page.tsx，对应 DataManagementTab.create_email_tab：
- 上部 Card "邮箱生成器"：
  · 模式 Select：顺序生成 / 随机生成 / 固定邮箱
  · 顺序模式：前缀 + 后缀 + 数量 + 起始数字
  · 随机模式：前缀 + 后缀 + 数量
  · 固定模式：Textarea（每行一个邮箱）
  · 按钮：[🚀 生成邮箱] [🗑️ 清空列表] [📧 导入 Outlook 邮箱]
- 下部 Card "邮箱列表"：
  · 统计行："总数 X | 未使用 X | 已使用 X"
  · DataTable 5 列：ID / 邮箱 / 类型 / 状态 / 创建时间
  · 底部：[删除选中] [刷新]

数据流（emails）：
- 生成：POST /api/data/emails/generate
- 列表：GET /api/data/emails
- 删除选中：批量 DELETE
- 清空：DELETE /api/data/emails
- 导入 Outlook：POST /api/data/emails/import-outlook，进度对话框（spinner）

webgui/src/app/(tabs)/data/users/page.tsx，对应 create_user_tab：
- 模式：随机生成 / 手动输入
- 随机：数量 NumberInput
- 手动：Textarea（指定格式：全名/邮遞區號/縣/地區/地址第1行/地址第2行，多用户空行分隔）
- 按钮：[🚀 生成用户] [🗑️ 清空列表]
- 列表 8 列：ID / 姓名 / 邮编 / 县 / 地区 / 地址 / 电话 / 状态

webgui/src/app/(tabs)/data/cards/page.tsx，对应 create_card_tab：
- 模式：虚拟卡生成 / 手动输入
- 虚拟卡：BIN + 数量 + 月份 Select(Random/01-12) + 年份 Select(Random/2025-2035) + CVV Input
- 手动：Textarea（卡号|月|年|CVV，每行一张）
- 列表 7 列：ID / 卡号（脱敏）/ 月 / 年 / CVV / 类型 / 状态
- 卡号脱敏由后端返回（card.get_masked_number()）

视觉：
- 模式切换用 Tabs 或 RadioGroup，切换时使用过渡动画
- 表格行可多选 Checkbox
- 操作完成 toast 反馈

验收：每个生成模式都能正常生成数据并落库。
```

---

### P7：代理配置弹窗

**开发 Prompt**：
```
实现 webgui/src/components/proxy-dialog.tsx，对应 gui/augment_tab.py 里的 ProxyConfigDialog。

UI（用 shadcn Dialog，宽度 900px）：
- 标题"代理配置"
- 上部"📋 已保存的代理列表"：
  · DataTable 6 列：选择(RadioGroup) / 代理地址 / IP / 位置 / 商家 / 操作(🔄 重新检测 + 🗑️ 删除)
  · 高度限制 250px，超出滚动
- 中部"➕ 添加新代理" + 灰色说明文字
  · Textarea 多行输入
- 底部按钮：
  [💾 保存并检测] [✅ 使用选中的代理] [🗑️ 清空所有] [关闭]

数据流：
- 打开时：GET /api/proxy/list
- 保存：POST /api/proxy/add（每个代理串后台串行检测，可用 SSE 或简单 spinner+一次性返回结果汇总）
- 清空：AlertDialog 确认 → DELETE /api/proxy
- 重新检测：POST /api/proxy/{id}/redetect → 刷新该行
- 删除：DELETE /api/proxy/{id}
- 使用选中：POST /api/proxy/select → 关闭弹窗 + toast

视觉细节：
- "保存并检测"过程中按钮 disabled + spinner
- 已检测/未检测状态通过 IP 列空与否表示
- 选中行用 RadioGroup 单选

验收：完整代理配置流程跑通；选中代理后 augment 注册能生效。
```

---

### P8：打包

**开发 Prompt**：
```
为重构后的项目实现单文件打包，要求开发体验和最终用户体验都不退化。

1. 修改 webgui/next.config.ts：
   output: 'export', basePath: '', assetPrefix: '', trailingSlash: true
   - 注意：使用 export 后，Next.js 不支持 SSR / 动态路由，所有 ws/api 都要客户端 fetch
   - 把所有 'use server' 移除（如果有）

2. 在 main.py 加判断：
   - if getattr(sys, 'frozen', False)：
     · 静态资源路径 = sys._MEIPASS / 'webgui_out'
     · pywebview 加载 file:///.../index.html
     · FastAPI server 仍正常启动在 127.0.0.1:8765
   - else: 加载 http://127.0.0.1:3535（dev）

3. 创建打包脚本 build_app.spec（PyInstaller spec 文件）：
   - datas 包含：
     · 'webgui/out/*' → 'webgui_out'
     · 'app_icon.ico' / 'app_icon.icns'
     · 'config/proxy_config.py' 等运行时需要的配置
   - hiddenimports 至少包含：
     · uvicorn.protocols.websockets, uvicorn.lifespan.on, uvicorn.loops.auto
     · undetected_chromedriver, selenium 全套
     · webview, webview.platforms.edgechromium
     · 现有代码中所有 hidden imports
   - 单文件 onefile + windowed
   - 注意 Windows 用 .ico、macOS 用 .icns

4. 修改 build_windows.bat：
   - 创建 venv（如不存在）
   - pip install -r requirements.txt
   - cd webgui && npm install --no-audit && npm run build
   - 回到根目录 → pyinstaller build_app.spec --clean --noconfirm
   - 验证 dist/OutlookRegister.exe 是否生成

5. build_macos.sh 同理（用 .icns）。

6. 在 README.md 更新打包章节，说明新的依赖（Node.js 20+ 必装）和构建步骤。

验收：
- 双击 dist 出来的 exe，前端能正常显示
- 所有 4 个主 Tab 功能可用
- 关闭窗口时进程完全退出（FastAPI 线程也要 daemon=True）
- 数据目录与原版一致（%APPDATA%\OutlookRegister）
```

---

### P9：清理与回归

**开发 Prompt**：
```
重构完成后的清理工作：

1. 确认所有功能在新架构下可用（按 Qt 版本走一遍清单）：
   □ 自动注册：完整跑一次注册流（含手动验证码确认）
   □ 邮件监听：浏览器模式 + API 模式各跑一次
   □ 账号管理：刷新/导出/复制/清空
   □ 数据管理 - 邮箱：3 种模式 + 导入 Outlook
   □ 数据管理 - 用户：随机 + 手动
   □ 数据管理 - 卡片：虚拟卡 + 手动
   □ 数据管理 - Augment：注册 + 代理配置
   □ 代理：保存检测、重新检测、删除、切换

2. 全部通过后：
   - 删除 gui/ 目录（PyQt6 旧实现）
   - 删除 main_pyqt_legacy.py
   - 从 requirements.txt 移除 PyQt6 / PyQt6-Qt6
   - 更新 README 项目结构图
   - 更新版本号到 v5.0.0（架构里程碑）

3. 写一段 CHANGELOG.md 记录此次重构（保留 Qt 版本的 git tag v4.x 作为回退点）。

验收：仓库干净、依赖瘦身、文档同步、能正常构建发布。
```

---

## 五、关键风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| WebSocket 双向阻塞确认实现复杂 | 注册流卡死 | 用 `asyncio.Event` + `loop.run_in_executor` 桥接，写充分的单元测试 |
| Next.js 静态导出限制（无 SSR） | 部分功能不能用 server actions | 严格走客户端 fetch，从一开始就这么写 |
| pywebview 在 Windows 旧版渲染问题 | 界面显示异常 | 默认走 Edge WebView2（Win10+ 自带），列入文档前置要求 |
| 打包后 Node.js 资源体积大 | EXE 变大 | next build 时启用 swcMinify；对静态资源 gzip；约 30-50 MB 增量可接受 |
| 用户密码暴露给 WebSocket | 安全风险 | ws 强制只走 127.0.0.1 + 本地启动；前端不持久化密码 |
| 旧 Qt 信号回调与异步代码语义不一致 | 阻塞回调死锁 | 把 `confirm_callback` 改造为返回 `Future` 的形式；线程池里 `future.result()` 等待 |
| 多个 Tab 同时运行后台任务（注册+监听） | 资源冲突 | 后端用任务管理器，每个任务有 task_id，禁止同类任务并行 |

---

## 六、验收标准（Definition of Done）

- ✅ 4 个主 Tab + 4 个子 Tab 的所有功能与 Qt 版本对齐（按 P9 清单）
- ✅ 单文件 EXE/APP 双击可用，不依赖外部 Python/Node 运行时
- ✅ 数据目录、配置文件路径、日志路径与 Qt 版本完全兼容（用户升级零迁移成本）
- ✅ Lighthouse 性能：FCP < 1s、Interactive < 2s（本地）
- ✅ README 完整更新：开发指南 + 打包指南 + 升级说明
- ✅ 旧 `gui/` 目录已删除，`requirements.txt` 已瘦身

---

## 七、执行建议

1. **顺序严格**：P0 → P1 → P2 → P3-P7（可适度并行）→ P8 → P9
2. **每完成一步运行 P0 的健康检查**（FastAPI + Next.js 联通）
3. **每个 Tab 完成后立刻和 Qt 版本对照走查一遍**，避免末期回滚
4. **保留 Qt 版本的 git 分支**（`legacy/pyqt-v4`）作为参考和应急回退
5. **Prompt 是模板**，执行时根据真实代码反馈微调（特别是 P1 阶段读懂现有 Worker 后可能要补充细节）

---

**最后更新**：2026-05-18
**作者**：架构组
**目标版本**：v5.0.0
