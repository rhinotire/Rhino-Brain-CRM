# AI 获客 Agent（B2B Prospecting Agent）设计 spec

日期：2026-07-24 ｜ 状态：待 William 审批 ｜ 分支：v2-platform

## 0. 背景

- 目标：为 Rhino Tire USA（FL）/ Everflow（TX）/ 青岛瑞诺（国际贸易）自动化 B2B 批发客户开发：找线索 → 背调评分 → AI 草拟外联 → 审核发送 → 回复交业务员。
- 竞品参照：iSales（外部供应商，¥50,000/2年预充值 + 按动作扣点）。决策：**不采购，自建**。其方法论（客户画像报告 + 会议纪要 + 产品截图）已消化进本设计。
- 自建理由：客户资产必须沉淀在自有 CRM（平台战略）；执行层 = Claude API + 数据 API，无不可替代技术；iSales 多租户演示暴露数据隔离风险；扣点模式成本不透明。
- 保留选项：接受 iSales 提出的免费单公司全流程演示，作为我们系统的对照基准，不预充值。

## 1. 范围与分期

**一期（美国国内，本 spec 的实施范围）**
- 数据源：种子名单导入、沉睡客户盘活、Google Places 按州采集、官网爬取 + AI 提取
- 产品线 Campaign 优先级（William 2026-07-24 确认，覆盖 iSales 报告的建议顺序）：
  1. **P4 卡车胎（TBR）— 最重要**：商用胎经销商、卡车维修店（truck shop）、车队公司（fleet）、大型运输公司（big transportation company）。车队/运输公司虽是终端用户，按老板决策直接开发（批量采购逻辑）
  2. **P3 乘用胎（PCR）**：轮胎零售店（tire shops）、区域批发商
  3. **P1/P2 拖车胎批发 + 拖车制造商**：trailer tires wholesale 渠道；trailer manufacturer（OEM）纳入一期触达范围（首触收集需求，正式准入推进仍需资料包就绪）
- 区域：L1-A 佛州及东南部（归 Rhino）、德州及南中部（归 Everflow）；其他州按仓库就近分配
- 外联：邮件自动发送（自建 Gmail API + 预热）+ 电话话术卡片
- CRM UI：线索校准队列、外联审核发件箱、五分法看板、成本看板

**二期（国际，青岛瑞诺）**
- 海关提单数据源（ImportYeti 起步）、按国家建线索池（L2 加拿大/墨西哥/加勒比 → L3 选择性）
- Twilio WhatsApp Business API：审核模板首触 → 24h 窗口内 AI 草拟+人工审发 → 高价值转业务员个人号
- 多语言开发信（英/西）

**三期（可选）**：短信（TCPA 合规后）、付费数据商（Apollo）、P5 OTR 产品线、大零售（Tractor Supply/Discount Tire 类）准入推进

**明确不做**：灰色 WhatsApp 个人号自动化（封号+资产归属风险）；向 C 端个人发送任何外联；话术中承诺关税税率。

## 2. 架构总览

```
┌─ 采集机 (collectors) ─┐   ┌─ 大脑 (brain) ────────┐   ┌─ 外联机 (outreach) ──────┐
│ 种子名单导入            │   │ 归一化去重(dedupeKey)  │   │ AI 草拟: 邮件/话术/WA模板 │
│ 沉睡客户盘活            │──▶│ 保护池强制过滤          │──▶│ 审核队列 → 排程发送        │
│ Google Places 按州扫    │   │ 六项校验(AI背调)       │   │ Gmail API + 预热限速      │
│ 官网爬取+AI提取         │   │ A-D×H/M/L 分级评分     │   │ 回复检测 → 停止跟进       │
│ 海关数据(二期)          │   │ 按州/产品线分配         │   │ Twilio WhatsApp(二期)    │
└───────────────────────┘   └───────────────────────┘   └──────────────────────────┘
                                      │
                        现有 Lead 表 → 现有 Pipeline → Customer → Dealer Portal
```

- 代码位置：采集/评分/外联引擎 → `packages/services`；UI 与 API → `apps/rhino-brain`；定时任务 → Vercel Cron。
- AI：Claude API（已有）。评分与草稿均输出结构化 JSON，存档原稿与终稿。

## 3. 数据模型（Prisma 变更）

### 3.1 Lead 扩展（现有表加字段）
- `pool` enum：`A_BUYER`（直接买家）/ `B_PROJECT`（OEM/大零售/项目准入）/ `C_CHANNEL`（渠道待核）/ `D_EXCLUDED`（保护排除）
- `confidence` enum：`H` / `M` / `L`
- `productLine` enum：`P1_TRAILER_TIRE` / `P2_TRAILER_WHEEL` / `P3_PCR` / `P4_TBR` / `P5_OTR`（可多条：主线一条即可，一期从简）
- `country`（默认 US）、`score Int`、`scoreReasons Json`（六项校验逐项结果）、`enrichment Json`（官网提取：主营品牌、批发信号、规模、岗位线索）、`dedupeKey String @unique`（域名/电话归一化）
- `sourceRunId` 关联采集批次

### 3.2 新表
- **ExclusionList**（保护/排除池）：`kind`（EXISTING_CUSTOMER / AGENT / COMPETITOR / OPTED_OUT / RISK）、`companyName`、`domain`、`phone`、`reason`、`reviewAt`、`addedById`。**任何外联发送前强制查询（域名+电话+公司名归一化匹配）**。初始化数据：全量现有 Customer + 代理 + 竞品名单（Tredit / Lionshead / Taskmaster / Martin Wheel / Dexter / TexTrail / Redneck）。
- **ProspectCampaign**：`name`、`productLine`、`channel`（EMAIL / PHONE_SCRIPT / WHATSAPP）、`targetStates` / `targetCountries`、`dailyQuota`（参照 iSales「每天找客户数」）、`followUpMode`（PRECISE / BULK）、`assignedRepId`、`paused`、`sendWindow`（工作时段）、`maxTouches`（默认 3-5 轮）
- **OutreachMessage**：`leadId`、`campaignId`、`channel`、`step`（第几轮）、`subject`、`aiDraft`、`finalBody`（人工改后）、`status`（DRAFT → NEEDS_REVIEW → APPROVED → QUEUED → SENT → DELIVERED / OPENED / REPLIED / BOUNCED / FAILED / OPTED_OUT / CANCELLED）、`approvedById`、`mailboxId`、`providerMessageId`、`scheduledAt` / `sentAt`
- **Mailbox**：`email`、`provider`（GMAIL）、OAuth 凭证（加密存储）、`warmupStage`（周数）、`dailyCap`（按预热曲线：W1=5 → W4=40）、`sentToday`、`active`
- **SourceRun**：`source`（SEED / REVIVAL / GOOGLE_PLACES / WEB_SCRAPE / CUSTOMS）、`params Json`、`resultCount`、`newLeadCount`、`dupCount`、`apiCost`、`tokenCost` —— 成本看板数据基础

### 3.3 状态机红线
- REPLIED：该 Lead 全部 QUEUED/APPROVED 消息立即 CANCELLED；Lead.stage 推进；创建 Notification 给 assignedRep。**AI 不参与回复后的对话（一期）。**
- OPTED_OUT：写 ExclusionList(kind=OPTED_OUT)，跨 Campaign 全局生效，立即。

## 4. 大脑：分级与校验

### 4.1 六项校验（AI 背调输出结构，存 scoreReasons）
1. 真实主体（官网/仓库/门店/团队证据）
2. 真实业务（在售轮胎/轮辋/拖车件相关）
3. 产品匹配（至少一条 P 线对应）
4. 采购逻辑（进口/批发/中央采购/OEM 配套/车队更换）
5. 联系人可定位（采购/品类/车队等岗位）
6. 排除风险（非保护对象、非竞品、非单店无采购权）

### 4.2 五池运营
| 池 | 进入标准 | 动作 |
|---|---|---|
| 自动开发池 | A-H，六项校验全过，非保护 | 进 Campaign，AI 草拟 3-5 轮触达 |
| 人工复核池 | A-M / C-H / C-M | 校准队列人工 2-5 分钟判定 |
| 项目/准入池 | B-H / B-M（OEM、大零售） | 拖车制造商一期可发首触邮件（收集需求，不承诺资质）；大零售三期推进 |
| 沉睡激活池 | 历史客户/报价客户超期无互动 | 独立 Campaign，优先跑（转化率最高，先验证发信引擎） |
| 保护/排除池 | D 类 | 永不自动触达；记录原因与复核日期 |

### 4.3 分配规则
FL 及东南部 → Rhino；TX 及南中部 → Everflow；其余州按两仓运费就近；`assignedRepId` 按 Campaign 配置或 location 现有规则。**沿用 company isolation 规则：业务员只见本 location 线索。**

## 5. 外联机

### 5.1 邮件（一期核心）
- 独立发信域名（待购，例如 rhinotire-wholesale.com；与主站身份说明互链）；SPF/DKIM/DMARC 必配
- 2-3 个 Google Workspace 邮箱进 Mailbox 池；预热曲线 W1=5/天 → W4=40/天/邮箱
- Vercel Cron 每小时：取 APPROVED+QUEUED 消息 → 检查 ExclusionList + 邮箱当日余量 + 发送时段（收件人时区工作时间）→ 随机间隔发送 → 更新状态
- 回复检测：Gmail API history 轮询（Cron 内），匹配 threadId/In-Reply-To → 触发回复红线
- CAN-SPAM：每封信含一键退订链接（`/api/unsubscribe?token=`，落 ExclusionList）+ 公司真实地址；主题行不得误导
- 内容规则（来自 iSales 报告，采纳）：**不同产品线不得共用同一封开发信**；开发信基于对方 enrichment（在售品牌/目录缺口）个性化；首封不发全目录，发一页式补充清单式卖点

### 5.2 电话话术卡片（一期）
每个 A 池线索生成：开场白（30 秒）、对方画像摘要、切入卖点（对方卖什么 → 我们哪个型号/价位带打它）、异议应对 3 条。展示在 Lead 详情页，供业务员照打。

### 5.3 WhatsApp（二期，Twilio Business API）
- 首触仅用 Meta 审核通过的模板消息；回复后 24h 窗口内 AI 草拟 + 人工审发；高价值转业务员个人号
- 号码质量分监控；被举报率异常自动暂停 Campaign

## 6. CRM UI（apps/rhino-brain 新增「获客」板块）

1. **获客总览**：SourceRun 列表、各池数量、漏斗（新线索→触达→回复→询盘→转化）
2. **校准队列**（复用 /spec-review 交互模式）：按产品线分组，卡片式逐条审：推荐理由标签 + 六项校验结果 + 官网摘要 + 三按钮「跟进（入自动池）/ 分配（指定业务员）/ 非目标」；标非目标必选原因，原因回流排除规则
3. **发件箱审核**：NEEDS_REVIEW 消息列表，AI 草稿可编辑，单条/批量批准；已发送消息状态跟踪（送达/打开/回复/退信）
4. **Campaign 管理**：配置面板字段 = dailyQuota / targetStates / followUpMode / assignedRep / paused / sendWindow（参照 iSales 配置面板）
5. **五分法看板**：客户质量（各池/各级数量、非目标原因分布）｜触达质量（有效邮箱率、退信、打开、回复、明确拒绝）｜商业推进（合格回复、询价、样品、报价）｜业务员承接（响应时间、跟进推进）｜客户资产（沉睡激活数、保护池覆盖）
6. **成本看板**：每 SourceRun 的 Places API 费 + Claude token 费 → 每 A 级线索真实成本（与 iSales 扣点价对照）

## 7. 种子名单（首批导入，来源：iSales 客户画像报告 2026-07-24）

导入为 Lead（source=SEED），预置 pool/confidence/productLine/切入要点；上线前逐家人工复核。按 Campaign 优先级，**Purcell、McCarthy、Parrish（P4/P5 商用线）为最高优先种子**；P4 的增量线索主要靠 Places 采集（搜索类目：commercial tire dealer、truck repair、truck stop、trucking company、fleet services）。

**A-H（8 家，直接买家，优先）**：The Trailer Parts Outlet（TX，P1/P2，托盘补库/预装总成切入）、Southwest Wheel（P1/P2/P4，ST总成+轮辋+支腿组合矩阵）、Eastern Marine/Trailer Parts Superstore（DE，P1/P2，boat/RV 耐腐蚀轮辋）、RecStuff（WI，P1/P2，目录缺口一页清单）、etrailer（P1/P2，可测试 SKU+资料包，项目式）、Parrish Tire Wholesale（P3/P4/P5，价位带缺口+区域保护）、Purcell Tire & Service（P4/P5/P1，工况+供应稳定）、McCarthy Tire Service（P4/P5，选定工况/尺寸+成本模型）

**A-M（4 家，人工复核后触达）**：Big Tex Trailer World、K&M Tire、Sturdy Built Trailer Parts、Leonard Truck Outfitters

**B 池（OEM/大零售，项目池，不进自动外联）**：Big Tex Trailers、PJ Trailers、Carry-On Trailer、Diamond C、Load Trail、Aluma、Tractor Supply、Discount Tire/Tire Rack

**C 池（渠道待核）**：TrailerTires.com、Trailer Parts Depot、Champion Trailers、Six Robblees、National Trailer Source、Northern Tool、FleetPride、RNR Tire Express

**D 池（竞品/供应链巨头，入 ExclusionList）**：Tredit、Lionshead、Taskmaster、Martin Wheel、Dexter、TexTrail、Redneck Trailer Supplies

## 8. 合规红线（代码强制，非流程约定）

1. 发送前强制查 ExclusionList（保护+退订）——发送引擎内硬检查，不可绕过
2. 回复即停 —— 状态机自动 CANCELLED
3. 每封邮件退订链接 + 公司地址 —— 模板层强制注入
4. 话术禁承诺关税税率（中国产拖车轮辋/总成涉 AD/CVD）—— prompt 层禁止 + 审核提示
5. 每邮箱日发送量硬上限（预热曲线）—— 超限熔断
6. OEM/车队触达可先行（首触收集需求），但报价与准入推进前需 DOT/质保资料包就绪；开发信不得虚构资质与认证

## 9. 90 天路径与指标

| 阶段 | 时间 | 动作 | 过程指标 |
|---|---|---|---|
| 1 对齐清洗 | D1-15 | 保护池初始化；种子导入；域名/邮箱购置预热启动；产品资料包（老板提供） | 保护池覆盖率；种子复核完成 |
| 2 样本验证 | D16-30 | 沉睡激活 Campaign 先行；Places 采集 FL/TX 首批；校准队列跑 50-80 家 | 六项校验通过率；邮箱预热正常 |
| 3 分线触达 | D31-60 | 按优先级跑三条 Campaign：P4 卡车胎（经销商+truck shop+车队/运输公司）→ P3 乘用胎（tire shops）→ P1/P2 拖车（批发+制造商首触） | 有效邮箱率、回复率、合格回复、询价数 |
| 4 收缩加码 | D61-90 | 按回复数据收缩画像；准备二期（海关数据+WhatsApp） | A-H 占比提升；每 A 级线索成本下降 |

## 10. 前置任务（需 William 提供/确认）

1. 真实公司信息包：对外主体名称口径、官网、电话、发信署名地址（iSales 报告里的主体/电话/域名信息是他们的演示数据，一律不用）
2. 按 P4 / P3 / P1-P2 优先级提供可售品牌、SKU、库存、MOQ、价格带、交期（决定开发信颗粒度）；P4 另需车队卖点素材（成本/英里、质保、供货稳定性）
3. 现有客户/代理/报价客户全量名单 → 保护池初始化
4. 独立发信域名选定与购买；Google Workspace 开通
5. Google Places API key
6. 首轮主推产品包确认：P4 卡车胎优先（型号/尺寸/价位带），P3、P1/P2 跟进
