# HK–SG Masters Platform

香港与新加坡授课型硕士项目信息整合与匹配网站。

用户可以按本科专业、GPA／学位等级和语言成绩筛选项目，查看公开入学要求、费用、申请时间和官方来源，比较课程并保存候选清单。网站不代办申请，不预测录取概率，也不保证录取。

## 当前状态

2026-10-21 路径核查更新：HKU CS 两条 Delta X 路径现有独立的部分核查记录及分类费用；第一／第二学期上海学习安排分别展示，项目范围仍为待确认，不视作纯香港授课。未公布的专业／GPA 条件、Fellowship 支持及实习安排不自动补造。路径证据现为 2 组／5 路径，申请人证据 8 学习选项／16 类别；总库仍为 873／默认 870／父项目页已查 21，独立复核和完整条件均为 0。以下较早批次数量保留为历史记录。见 [Delta X 路径核查与范围提示](docs/research/hku-delta-routes-2026-10-21.md)。

2026-10-21 申请轮次功能更新：港大 CS 普通路径的主轮与补录轮已结构化显示，可按记录的 UTC+08 中午时间比较截止状态，并突出下一轮。列表、详情、比较及候选导出保持同一选择范围；不推断开放时间、不自动通知。来源日期及全部质量计数不变。见 [分轮截止功能记录](docs/progress/2026-10-21-local-application-rounds.md)。

2026-10-21 入学条件更新：HKU Computer Science 的普通申请路径（不含 Delta X Fellowship）已单独接入，包含 2027/28 全日制／兼读制、用户明确选择的本地／非本地费用、两轮中午截止说明和一般英语条件。未找到的专业清单和 GPA 最低值不自动补造，其余两条 Delta X 路径仍待核查。路径证据现为 2 个分组、3 条路径；申请人费用证据为 5 个学习选项、10 个类别。它们独立计数，不把总库 873／默认 870／项目页已查 21 或人工复核 0、完整条件 0 上调。详见 [本轮路径核查](docs/research/hku-cs-ordinary-route-2026-10-21.md)。

2026-10-21 本地最新：总库 873 条目录记录，默认浏览 870 条；项目页已查仍为 21，独立复核和完整条件仍为 0。本批完成 HKU 目录整理，官网观察日期保留为 10 月 20 日：两类申请人视图各 17 页、170 行，分为 99 个保守候选组，新增 80 条未核验线索；关闭、插读及交付边界有单独记录。这些数量不是完整已核验项目或当前开放申请数量。详见 [HKU 目录盘点](docs/research/hku-directory-pass-2026-10-20.md)。此前 CityU 新增 52 条、EdUHK 56 条、HKUST 45 条、PolyU 89 条未核验线索，分别见 [CityU](docs/research/cityu-directory-pass-2026-10-20.md)、[EdUHK](docs/research/eduhk-directory-pass-2026-10-20.md)、[HKUST](docs/research/hkust-directory-pass-2026-10-20.md)及 [PolyU](docs/research/polyu-directory-pass-2026-10-20.md)。以下保留早期开发记录及当时数量，不应当作最新总量。

2026-10-06：本地可运行版本 0.1.0 已实现。网站统一采用英文界面，包含搜索、项目详情、背景输入及逐条件判断、课程比较、候选清单和数据工作台。当前开发工作保存在本地，尚未公开部署。

原始工作簿冻结于 2026-09-29，包含 14 所目标大学的 175 条课程种子，其中只有 1 条标记为项目页已核验。这不是完整课程清单，也不是可直接上线的匹配数据库。旧版加权评分规则尚未验证，不能作为正式招生标准使用。

官方页面更新保存在 `data/checked-programmes.json`，没有改变原始工作簿。首批 20 个直接申请项目覆盖全部 14 校（香港 10、新加坡 10），另保留 HKUST 转入限定 MEng；项目页已查合计 21 条，独立复核和完整条件记录均为 0。MEng 转入路径保留但不在默认搜索显示。

2026-10-08：`data/catalogue-expansion.json` 补入 186 条未核验目录线索，数据库共 361 条，默认浏览 360 条；项目页检查仍为 21，独立复核与完整条件仍为 0。原始 175 条数据没有改动。目录扩展不会覆盖已经存在的用户更新记录。

`data/directory-audit.json` 记录 14 校入口及枚举进度。10 月 8 日批次的目录范围计数为 HKBU 49、Lingnan 44、CUHK 129，另保留先前 SIT 4 的计数；当时 PolyU 的 111 个硕士／组合条目并非精确总数。10 月 20 日 PolyU 已另读一月及九月共 169 行，形成 100 个保守候选组，组合学位、交付及停招案例仍待确认。完整 14 校枚举尚未完成，这些数量不代表全部正在招生。

## 本地运行

Windows 双击 `start-local.cmd`，待启动窗口显示网址后打开 `http://127.0.0.1:3102`。服务窗口需要保持运行。需要 Node.js 24 或以上；启动脚本也会检查当前用户已有的 Codex 内置 Node。

也可在项目目录运行 `node server/index.mjs` 或 `npm start`，无需安装额外运行依赖。运行和数据更新方式见 [本地运行与维护](docs/local-development.md)。

## 文档入口

- [项目范围与功能需求](docs/scope-and-requirements.md)
- [团队分工与协作方式](docs/team-and-workflow.md)
- [项目周历与开发任务](docs/calendar-and-backlog.md)
- [前三周回顾](docs/progress/weeks-01-to-03.md)
- [数据字段与匹配原则](docs/data-and-matching.md)
- [现有数据及限制](data/README.md)
- [如何提交修改](CONTRIBUTING.md)
- [本地运行与维护](docs/local-development.md)
- [首批官方数据核查记录](docs/research/official-data-pilot-2026-10-06.md)
- [10 月 8 日目录扩展与核查记录](docs/research/directory-expansion-2026-10-08.md)
- [10 月 20 日 CityU 目录盘点与边界记录](docs/research/cityu-directory-pass-2026-10-20.md)
- [10 月 20 日 EdUHK 目录盘点与语言／待批准条目记录](docs/research/eduhk-directory-pass-2026-10-20.md)
- [10 月 20 日 HKUST 目录、学位组合与交付边界](docs/research/hkust-directory-pass-2026-10-20.md)
- [10 月 20 日 PolyU 两批入学目录与学位／组合课程边界](docs/research/polyu-directory-pass-2026-10-20.md)
- [10 月 20 日 HKU 目录、申请人类别与关闭／交付边界](docs/research/hku-directory-pass-2026-10-20.md)
- [10 月 21 日 HKU Computer Science 普通路径、语言及分类费用](docs/research/hku-cs-ordinary-route-2026-10-21.md)

## 下一步

1. 全体成员核对前三周回顾，补充实际发生的活动及可用证据。
2. 继续剩余学校的全量枚举，并展开 PolyU 等组合课程、核对待批准及交付地点。
3. 补齐并人工复核首批 20 个代表性项目，再扩大覆盖；不能把自动采集当成独立复核。
4. 实测本地流程，逐批完成条件核验，继续补充数据和正式部署前的安全要求。

代表性课程用于验证方法，不替代最终的 14 校覆盖范围。本地版本采用 Node.js、SQLite 和浏览器原生界面；正式托管方式尚未确认。背景默认在页面会话中使用，可选择保存到浏览器，不写入服务器数据库。

## 团队

| 成员 | 学科 | 主要职责 |
| --- | --- | --- |
| Song Shaoheng | CP | Project Manager & Product Owner |
| Wu Buqing | CP | Data & Matching Developer |
| Zhang Dawei | CP | Frontend & Deployment Developer |
| Wang Youran | BU | Research & Programme Content Lead |
| Chen Chuanjin | BU | Business & Stakeholder Lead |
| Li Anji | BU | Project Coordinator & QA Lead |

## 数据与隐私

仅收集官方公开课程信息。密码、密钥、真实学生档案、成绩单、CV、联系电话和签名文件不得提交到仓库。研究及测试先使用匿名反馈或合成档案。课程提交资料在课程指定平台管理。
