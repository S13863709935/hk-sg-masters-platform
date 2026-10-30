# HK–SG Masters Platform

香港与新加坡授课型硕士项目信息整合与匹配网站。

用户可以按本科专业、GPA／学位等级和语言成绩筛选项目，查看公开入学要求、费用、申请时间和官方来源，比较课程并保存候选清单。网站不代办申请，不预测录取概率，也不保证录取。

## 当前状态（2026-10-30）

本地英文网站支持项目浏览、背景条件比对、比较、候选清单及导出；核心功能已实现，课程数据仍在完善。

- 14 校、873 条目录记录，默认可浏览 869 条；174 条有部分官方项目页观察，699 条仍主要是目录线索。
- 完整要求集和独立人工复核均为 0。6 组／15 条路径及 78 组／158 类申请者上下文分开计数，不当作新增硕士。
- **Recorded comparisons met** 只比较已记录的背景条件，另列待确认条件，不等同于完整资格或推荐分档。
- 本批为 HKUST 剩余 18 个原目录 ID 补入商科、人文、公共政策及跨学科的部分详情；MBA 保留原分组身份，新增 2 份方向快照。共 26 个直接选项和 3 个 MBA 模式选项，新增 14 组／28 类费用日期上下文。HKUST 49 条中，48 条有部分观察（含 1 条旧转入参考），剩余 1 条为按英国交付排除的 GMRM 线索；这不是 48 个完整、开放申请的独立学位。
- Accounting 的非商科替代条件、Finance 兼读经验要求、ILE 两个方向的语言及中文证明分别保留。GCS 记录真实的原始 3.0/4.0 门槛及较高英语要求；普通学位不套研究方向的两年费用。ILE 分方向语言仍须确认，不产生通用英语通过。
- MBA 日期按 International 与 Local HK/valid-visa 标签区分；全日制本地最终日期未知，保留 International 5 月 13 日的说明，不设通用截止。EMBA 英语豁免明确，但环球模块的参加要求和香港单一交付范围仍未确认。航空工程原有类别日期冲突不变。
- 原核心 20 个项目、71 个选项组合与 7 个合成背景共有 497 次比较：125 次有已知缺口、372 次待确认、0 次完整达标、0 次违规。软件检查不等于独立招生核验。

本轮仅本地保存。最近已发布的 W6 检查点不因本地修改自动更新。HKUST 本轮目录覆盖的首遍资料已整理到可说明缺漏的状态；下轮先收敛方向选择、冲突及资料质量，再批量扩展下一校。每次“继续”不自动推送。

[HKUST 质量表](docs/research/hkust-remaining-quality-2026-10-30.md) · [267 单元维护清单](docs/research/source-review-queue-2026-10-30-hkust-remaining.md) · [核心验收](docs/research/core-pilot-acceptance-2026-10-30-hkust-remaining.md) · [本批改动与限制](docs/progress/local-hkust-remaining-2026-10-30.md)

同日较早的 [HKUST 工程／理科批次](docs/progress/local-hkust-engineering-2026-10-30.md)、[香港现有记录质量表](docs/research/hk-existing-records-quality-2026-10-30.md)和 [SMU 质量表](docs/research/smu-school-quality-2026-10-30.md)保留当时输入及计数。

此前批次记录见[本地开发历史](docs/progress/local-history-through-2026-10-29.md)，原研究文件及查阅日期保留。

## 本地运行

Windows 优先双击 `start-local.cmd`（不是 `.ps1`），待启动窗口显示网址后打开 `http://127.0.0.1:3102`。服务窗口需要保持运行；在窗口按 Ctrl+C 可停止。需要 Node.js 24 或以上；启动脚本会跳过旧版 Node，并检查当前用户已有的 Codex 内置 Node。它不安装软件、不修改全局 PATH 或系统执行策略。

只有 `node --version` 已显示 24 或以上时，才在项目目录直接运行 `node server/index.mjs` 或 `npm start`。本机交付检查时，默认命令行 Node 仍是 16，因此推荐使用上述启动入口。无需安装额外运行依赖；`.env.example` 不会自动生效。端口调整、备份与排错见 [本地运行与维护](docs/local-development.md)。

## 文档入口

- [项目范围与功能需求](docs/scope-and-requirements.md)
- [团队分工与协作方式](docs/team-and-workflow.md)
- [项目周历与开发任务](docs/calendar-and-backlog.md)
- [前三周回顾](docs/progress/weeks-01-to-03.md)
- [数据字段与匹配原则](docs/data-and-matching.md)
- [现有数据及限制](data/README.md)
- [如何提交修改](CONTRIBUTING.md)
- [本地运行与维护](docs/local-development.md)
- [10 月 23 日集中验收记录](docs/progress/2026-10-23-local-site-acceptance.md)
- [10 月 23 日交付检查与功能冻结](docs/progress/2026-10-23-local-delivery-freeze.md)
- [首批官方数据核查记录](docs/research/official-data-pilot-2026-10-06.md)
- [10 月 8 日目录扩展与核查记录](docs/research/directory-expansion-2026-10-08.md)
- [10 月 20 日 CityU 目录盘点与边界记录](docs/research/cityu-directory-pass-2026-10-20.md)
- [10 月 20 日 EdUHK 目录盘点与语言／待批准条目记录](docs/research/eduhk-directory-pass-2026-10-20.md)
- [10 月 20 日 HKUST 目录、学位组合与交付边界](docs/research/hkust-directory-pass-2026-10-20.md)
- [10 月 20 日 PolyU 两批入学目录与学位／组合课程边界](docs/research/polyu-directory-pass-2026-10-20.md)
- [10 月 20 日 HKU 目录、申请人类别与关闭／交付边界](docs/research/hku-directory-pass-2026-10-20.md)
- [10 月 21 日 HKU Computer Science 普通路径、语言及分类费用](docs/research/hku-cs-ordinary-route-2026-10-21.md)

## 数据维护与下一步

按学校批量核对现有资料，先提高匹配实用性并明确缺漏，再扩展目录。每条正式用于匹配的记录应说明本科背景、学术成绩、语言、适用批次及官方来源；未采集、未公布及需学校判断是不同状态。暂不具备条件的记录继续标作线索，不能凭未知项认定达标。

下一批按 HKUST 剩余商科、人文／公共政策及跨学科身份分组推进；CityU 的 EMBA／旧土木身份继续保留待确认依据。P17 名称批准／费用适用、Financial Mathematics and Statistics 的实际学分及年度负载继续单列，不因等候这些事项阻塞其他分组。14 校全量目录身份、组合／跨地区边界和新增 SMU MPGL 仍待核对。软件变更限于可复现的问题及匹配、数据维护的必要改进，不按每次“继续”增加功能。

[维护工具](scripts/source-review-queue.mjs)与[学校质量检查](scripts/school-quality.mjs)只读本地来源并要求明确比较日期，不写日常数据库或授予复核状态。真实复核、实际用户反馈和正式托管仍待完成，不能用自动检查代替。

GitHub 发布按[发布安排](docs/publication-policy.md)在有意义的阶段批次进行。使用真实工作日期，不重写旧历史，不把本地完成当作已推送、上线或课程提交。

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
