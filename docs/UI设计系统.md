# 利群翻译 · UI 设计系统

> 依据《实时翻译-产品需求文档》与当前 React + Tailwind 实现整理，供网页端与后续移动端/Tauri 壳统一对齐。  
> 技术栈：**Tailwind CSS**、**Radix UI**、**lucide-react**。

---

## 1. 设计原则

| 原则 | 说明 |
|------|------|
| **导航 / 任务分层** | 侧栏承担全局导航；主内容区承担「落地营销」与「同传任务」—— 明度与密度上区分层级。 |
| **单一主行动点** | 落地页突出一个主 CTA（「开始同传」）；同传页突出「听译内容 + 底部控制」。 |
| **轻量玻璃与渐变** | 主区背景为浅蓝—紫氛围；卡片可用白底、浅边、柔和阴影；同传气泡 PRD 要求 **半透明 + 背景模糊**（实现可逐步从「实心卡片」演进到 `backdrop-blur`）。 |
| **状态可见** | 监听中、已连接、错误等用 **色点 + 文案 + 可选动效**（如 `animate-ping`）表达，避免仅靠颜色。 |
| **本地与隐私语境** | 设置、关于页强调「Key 在后端、音频默认不出网」等说明，使用克制的中性文案层级。 |

---

## 2. 品牌与命名

- **产品中文名**：利群翻译  
- **产品英文名**：Liquun Translate  
- **主色意象**：蓝（sky）— 紫（violet）— 靛（indigo）渐变，表达「沟通、实时、智能」。  
- **辅助色**：翠绿（emerald）表成功/就绪；玫红（rose）表停止/危险操作；琥珀（amber）表提示/收藏类功能。

---

## 3. 设计令牌（Design Tokens）

### 3.1 色彩

#### 品牌与渐变

| 令牌 | 用途 | Tailwind / 值 |
|------|------|----------------|
| `brand.gradient.hero` | 主标题字、主按钮 | `from-sky-600 via-violet-600 to-violet-700`（字用 `bg-clip-text text-transparent`）；按钮 `from-violet-600 to-indigo-600` |
| `brand.shadow` | 主按钮光晕 | `shadow-lg shadow-violet-500/30`，hover 可加 `shadow-xl` |
| `brand.icon-bg` | Logo 区、中心图标底 | `from-sky-500 via-violet-500 to-violet-700` 或 `from-sky-500 to-violet-600` |

#### 表面（Surface）

| 令牌 | 浅色 | 深色（落地页 darkMode） |
|------|------|-------------------------|
| `surface.app-shell` | 外层 `bg-slate-100`，主区 `bg-[#fafbfc]` | `bg-slate-950` |
| `surface.header` | `bg-white/90` + `border-slate-200/90` + `backdrop-blur-md` | `bg-slate-900/90` + `border-slate-800` |
| `surface.card` | `bg-white` + `border-slate-200/80` | `bg-slate-900/60` + `border-slate-700/80` |
| `surface.muted` | `bg-slate-50/80`、Tabs 轨道 `bg-slate-100/90` | 同系 slate 加深 |

#### 文本

| 层级 | 浅色 | 深色 |
|------|------|------|
| 主标题 | `text-slate-900` 或品牌渐变字 | `text-slate-100` |
| 正文 | `text-slate-700` ~ `text-slate-800` | `text-slate-200` |
| 次要 | `text-slate-500` | `text-slate-400` |
| 标签/禁用 | `text-slate-400` | `text-slate-500` |

#### 语义色

| 语义 | 示例类名 |
|------|-----------|
| 成功/已安装/就绪 | `text-emerald-600`、`bg-emerald-50`、`ring-emerald-100` |
| 监听/录制 | `bg-red-500` + `animate-ping`（脉冲外圈） |
| 停止/破坏性 | `border-rose-200`、`bg-rose-50`、`text-rose-700` |
| 焦点环 | `focus-visible:ring-2 focus-visible:ring-violet-300` 或 `ring-violet-200` |

#### PRD 侧栏（深色效率工具风）— **目标规范**

当前实现侧栏为 **浅白底**；PRD §4.1.1 建议 **深色背景 + 当前项高亮**。迁移时可采用：

- 侧栏底：`bg-slate-900` 或 `bg-slate-950`  
- 默认项：`text-slate-400`，hover：`bg-slate-800/80`  
- 选中项：`bg-violet-600/20` + `text-violet-200` + `border-l-2 border-violet-400`（或与现有 `from-violet-50` 方案做暗色映射）

设计系统 **同时** 保留现有浅色侧栏令牌，便于渐进改版。

### 3.2 字体

| 角色 | 配置 |
|------|------|
| **UI 正文** | `font-sans`：`system-ui`、`-apple-system`、`PingFang SC`、`Microsoft YaHei` 等（见 `tailwind.config.js`） |
| **展示标题** | `font-display`：`"Ma Shan Zheng"`（Google Fonts，见 `index.html`），用于落地页主标题；长段落避免全篇使用 |
| **等宽数据** | 计时器等：`font-mono` + `tabular-nums` |

**字号阶梯（与现有一致）**

- 页面标题：`text-lg` ~ `text-base font-semibold`  
- 区块标题：`text-base font-semibold`  
- 正文：`text-sm` ~ `text-base`  
- 辅助：`text-xs` ~ `text-[13px]`  
- 落地主标题：`text-[2.35rem]` → `sm:text-5xl` → `md:text-[3.25rem]`，`leading-[1.15]` ~ `1.2`

### 3.3 圆角

| 元素 | 圆角 |
|------|------|
| 大卡片、会话气泡、设置区块 | `rounded-2xl` |
| 按钮（主 CTA） | `rounded-full`（落地）或 `rounded-xl`（表单） |
| 输入框、下拉触发器 | `rounded-xl` |
| 侧栏 Logo | `rounded-2xl` |
| 图标容器 | `rounded-xl` |

### 3.4 间距与宽度

- **侧栏宽度**：`256px`（`w-[256px]`），与 `App.tsx` 常量一致。  
- **主内容最大宽**：落地 `max-w-6xl`；同传内容 `max-w-2xl`；设置 `max-w-5xl`，表单列 `max-w-2xl`。  
- **页面边距**：`px-4 sm:px-6 md:px-10`；纵向 `py-3.5` ~ `py-8`。  
- **卡片内边距**：`p-5` ~ `p-6`，大卡片 `md:p-8`。

### 3.5 阴影与模糊

| 令牌 | 定义 |
|------|------|
| `shadow-soft` | `0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.06)` |
| `shadow-card` | `0 1px 3px rgba(15,23,42,0.06), 0 8px 24px rgba(15,23,42,0.06)` |
| `backdrop-blur` | 顶栏 `backdrop-blur-md`；玻璃气泡建议：`bg-white/70` + `backdrop-blur-xl` + `border-white/40`（与 PRD 对齐时采用） |

### 3.6 动效

- **过渡**：`transition` 默认 150–200ms；侧栏宽度 `duration-200 ease-out`。  
- **主按钮按下**：`active:scale-[0.99]`。  
- **状态脉冲**：就绪/监听用 `animate-ping` 低透明度外圈 + 实心内点。  
- **避免**：同传列表热路径上避免大面积持续动画。

---

## 4. 布局：网页端

### 4.1 应用骨架

```
┌──────────────┬────────────────────────────────────────┐
│   Sidebar    │  Header（顶栏：语言 / 状态 / 主题）      │
│   256px      ├────────────────────────────────────────┤
│              │                                        │
│   导航       │  Main（落地 / 同传 / 设置 / 占位页）    │
│              │                                        │
└──────────────┴────────────────────────────────────────┘
         ↑ 浮动「收起/展开」圆形按钮贴侧栏边缘
```

- **收起侧栏**：宽度动画至 `0`，`pointer-events-none`；展开按钮移至 `left-3`。  
- **主区深色模式**：由落地页控制 `darkMode` 时主区 `bg-slate-950`（与 PRD「仅主区深浅切换」可并存，全局策略需在实现层统一）。

### 4.2 断点（Tailwind 默认）

| 断点 | 用途 |
|------|------|
| 默认 | 单栏堆叠；顶栏语言区保留左右留白（`px-14` 避让折叠钮） |
| `sm:` | 略放宽字号与间距 |
| `md:` | 顶栏/内容区更大水平 padding |
| `lg:` | 落地页双栏：`lg:grid-cols-[1fr_1.05fr]`；特性卡片 `lg:grid-cols-4` |

### 4.3 同传页特殊布局

- 内容区 `pb-36` 为底部悬浮条预留。  
- 底部控制条：`absolute` + 底部渐变遮罩 `from-slate-100 via-slate-100/90 to-transparent`，保证条带浮在内容之上。

---

## 5. 移动端与窄屏

> 第一期以 macOS 本机浏览器为主；以下规范保证 **460px–768px** 与 **<460px** 仍可可用，便于后续 WebView / 第二期壳。

| 区域 | 规则 |
|------|------|
| **侧栏** | 默认可改为 **抽屉/覆盖层**（未实现时保留折叠为 0 宽 + 浮动展开）。 |
| **顶栏** | 语言选择 `flex-wrap`；缩小 `min-w` 的下拉，避免横向溢出。 |
| **落地主 CTA** | `min-w-[13rem]` + 全宽 `max-w` 限制，小屏保持可点区域 ≥ 44×44pt。 |
| **同传气泡** | 维持 `max-w-2xl` 与 `px-5`，字号略减可用 `text-sm` 正文。 |
| **底部控制条** | `flex-wrap` + `gap-2`；计时与「停止」在极窄屏可换行；保持 `rounded-2xl` 胶囊整体感。 |
| **设置表单** | `sm:grid-cols-[132px_1fr]` 在窄屏退化为单列全宽。 |

**安全区**：若嵌入 iOS WebView，底部控制条增加 `pb-[env(safe-area-inset-bottom)]`（实现阶段补）。

---

## 6. 卡片（Cards）

### 6.1 特性卡片（落地页四宫格）

- 容器：`rounded-2xl border p-5` + `surface.card`  
- 图标：`h-11 w-11 rounded-xl` + 浅色底（`bg-violet-100 text-violet-600` 等）  
- 标题：`text-sm font-semibold`  
- 描述：`text-xs leading-relaxed text-slate-500`

### 6.2 提示条（Tips）

- `rounded-2xl border px-4 py-3.5`  
- 浅色：`border-violet-100 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 text-violet-900`  
- 深色：`border-violet-900/40 bg-violet-950/50 text-violet-100`  
- 左侧可放 emoji 圆标：`rounded-full bg-white/80`

### 6.3 同传会话气泡（原文 + 译文）

**当前实现**：白底 + `shadow-soft` + 分隔线渐变。

**PRD 目标（玻璃拟态）** 建议规格：

- `bg-white/60 dark:bg-slate-900/50 backdrop-blur-xl`  
- `border border-white/50 dark:border-slate-700/60`  
- 上层「原文」：`text-sm text-slate-700`；标签 `uppercase tracking-widest text-slate-400`  
- 下层「译文」：`text-base font-medium text-slate-900`；标签 `text-violet-600/90`  
- 中间分隔：`h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent`

### 6.4 设置页大卡片

- `rounded-2xl border border-slate-200/90 bg-white p-6 shadow-soft md:p-8`  
- 列表型 ASR：`divide-y divide-slate-100`，行内 `bg-white`，外层浅底 `bg-slate-50/50`

---

## 7. 控件（Controls）

### 7.1 语言选择（Radix Select）

- **触发器**：`h-9 min-w-[118px] rounded-xl border border-slate-200/90 bg-white px-3 text-sm shadow-sm`  
- **打开态**：`data-[state=open]:border-violet-300 data-[state=open]:ring-1 ring-violet-200`  
- **下拉面板**：`rounded-xl border border-slate-200 bg-white p-1 shadow-card`  
- **选项**：`rounded-lg px-2.5 py-2`，高亮 `data-[highlighted]:bg-violet-50`，选中 `font-semibold text-violet-900`

### 7.2 语言条容器

- `rounded-2xl border border-slate-200/90 bg-white/90 p-1.5 shadow-sm`  
- 工具栏变体可加 `ring-1 ring-slate-100`  
- 交换语言：`rounded-lg p-2 hover:bg-violet-50 hover:text-violet-700`

### 7.3 文本输入 / 下拉（原生 select）

- `rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm`  
- **焦点**：`focus:border-violet-300 focus:ring-2 focus:ring-violet-200`  
- **标签**：`text-xs font-medium text-slate-600`；必填星号 `text-rose-500`

### 7.4 标签页（Radix Tabs）

- **列表轨道**：`rounded-xl bg-slate-100/90 p-1 ring-1 ring-slate-200/60`  
- **触发器**：`rounded-lg px-3 py-2 text-sm text-slate-600`  
- **选中**：`data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-violet-800 data-[state=active]:shadow-soft`

### 7.5 列表行操作（ASR）

- **主按钮（安装）**：见 §8.1 小号主按钮  
- **次要（卸载）**：`border border-slate-200 bg-white text-xs font-medium hover:bg-slate-50`  
- **状态徽章**：`rounded-full px-2.5 py-1 text-xs font-medium ring-1`（已安装 emerald 系）

---

## 8. 按钮（Buttons）

### 8.1 主按钮（Primary）

| 场景 | 规格 |
|------|------|
| 落地页 CTA | `rounded-full h-[3.25rem] min-w-[13rem] px-10 text-base font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 ring-1 ring-white/20 shadow-lg shadow-violet-500/30 hover:from-violet-500 hover:to-indigo-500` |
| 表单主操作 | `rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-soft hover:bg-violet-500` |
| 图标主按钮（麦克） | `h-11 w-11 rounded-xl bg-violet-600 text-white shadow-soft hover:bg-violet-500` |

### 8.2 次要按钮（Secondary）

- `rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-soft hover:border-slate-300 hover:bg-slate-50`

### 8.3 破坏性 / 停止

- `rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100`  
- 图标可 `fill-current` 小方塊（停止）

### 8.4 幽灵 / 文本按钮

- 返回：`rounded-xl border border-transparent px-2 py-2 hover:border-slate-200 hover:bg-slate-50`  
- 或圆角药丸：`rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm`

### 8.5 图标按钮

- 侧栏折叠：`h-9 w-9 rounded-full border border-slate-200 bg-white shadow-card hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-violet-300`  
- 主题切换：`rounded-full p-2.5`，浅色 `bg-slate-100`，深色 `bg-slate-800 text-amber-300`

---

## 9. 导航与其它模式

### 9.1 侧栏导航项

- **默认**：`rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50`  
- **选中（当前实现）**：`bg-gradient-to-r from-violet-50 to-indigo-50/80 text-violet-900 shadow-sm ring-1 ring-violet-200/70`  
- **图标**：`18px`，选中 `text-violet-600`，否则 `text-slate-500`

### 9.2 页头（同传 / 设置）

- `border-b border-slate-200/90 bg-white shadow-soft`  
- 状态点：`h-2 w-2 rounded-full bg-emerald-500` + 外圈 `shadow-[0_0_0_3px_rgba(16,185,129,0.25)]`

### 9.3 占位页

- 居中 `text-sm text-slate-500`；顶栏与设置一致的返回模式任选其一以保持统一。

### 9.4 可选：反馈入口

- `fixed bottom-32 right-5 rounded-full border ... text-xs`；小屏可隐藏（`hidden sm:inline-flex`）。

---

## 10. 图标与插图

- **图标库**：lucide-react，线宽默认 `strokeWidth={2}`，展示大块可用 `1.25` ~ `1.75`。  
- **产品 Logo 区**：`MessageCircle` 置于渐变圆角方形容器。  
- **特性/功能**：`AudioWaveform`、`Mic`、`FolderOpen`、`Star`、`Users` 等与文案语义一致即可。

---

## 11. 无障碍与表单

- 可点击区域 ≥ 40px；图标按钮需 `aria-label`。  
- 焦点可见：`focus-visible:outline` / `ring-2`。  
- Radix Select/Tabs/Label 保持原生语义；密码框 `autoComplete="off"`（按场景调整）。  
- 侧栏收起时对容器使用 `aria-hidden` 与 `inert`（与现实现一致）。

---

## 12. 文案与语气（界面层）

- **主 CTA**：「开始同传」  
- **会话状态**：「同传进行中」「监听中」  
- **区块标签**：「原文 · ASR」「译文 · LLM」  
- **设置说明**：强调后端保存 Key、占位表单提示，避免用户误以为 Key 存浏览器。

---

## 13. 与代码的映射

| 设计系统区域 | 主要文件 |
|--------------|-----------|
| 全局布局、侧栏宽 | `src/App.tsx` |
| 侧栏 | `src/components/Sidebar.tsx` |
| 落地页 | `src/components/LandingPage.tsx` |
| 同传 | `src/components/LiveSessionPage.tsx` |
| 语言控件 | `src/components/TopBarLanguages.tsx` |
| 设置 | `src/components/SettingsPage.tsx` |
| 令牌扩展 | `tailwind.config.js`、`src/index.css` |

---

## 14. 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 0.1 | 2026-04-24 | 初版：对齐 PRD v1.2 与当前 UI 实现，含网页/移动适配、卡片、控件、按钮与侧栏目标态。 |

---

*文档路径：`docs/UI设计系统.md`*
