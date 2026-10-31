# HK–SG Masters Platform

香港与新加坡授课型硕士项目信息整合与匹配网站。

用户可以按本科专业、GPA／学位等级和语言成绩筛选项目，查看公开入学要求、费用、申请时间和官方来源，比较课程并保存候选清单。网站不代办申请，不预测录取概率，也不保证录取。

## 当前状态（2026-10-31）

本地英文网站支持项目浏览、背景条件比对、比较、候选清单及导出；核心功能已实现，课程数据仍在完善。

- 14 校、873 条目录记录，默认可浏览 869 条；226 条有部分官方项目页观察，647 条仍为目录线索。完整要求集和独立人工复核均为 0。
- 7 组／17 条方向快照、146 组／294 类申请者费用日期上下文分开计数，不新增硕士学位。维护清单有 389 个单元，3 个单元的记录截止临近，失配绑定为 0。
- 本轮为港大 AI、金融科技与数据分析、数据科学、电子商贸及互联网工程、统计学五个已有项目补入资料，覆盖 8 个学制选项和 7 组／14 类费用日期上下文。港大现有 103 条目录中有 6 条部分观察；这不代表完成全校核对。
- 金融科技与数据分析仅列已明确公布的兼读选项；数据科学、统计学与 AI 的先修准备保持人工证据确认。类别总学费、获批状态、已抵首期学费的押金和额外费用分开说明；Science AI 未查明的申请费不套用其他项目。
- 两条 CS Delta X 路径明确要求上海学期，单独列为地域范围之外；普通香港 CS 路径和原有费用日期绑定保留。英语新旧量表、单项和入学年锚定的成绩日期分别比较，所有项目仍保留未确认条件。
- **Recorded comparisons met** 仅指已记录的背景比较，没有完整资格或录取分档含义。20 个原核心 ID、71 种选择与 7 个合成背景仍有 497 次比较：125 个缺口、372 个待确认、0 个完整达标和 0 个违规。

本轮只在本地保存，不自动推送。建议在下一周检查点统一发布一个可审阅的完整批次；最近已发布的 W6 检查点保持不变。

[HKU 质量表](docs/research/hku-computing-quality-2026-10-31.md) · [389 单元维护清单](docs/research/source-review-queue-2026-10-31-hku-computing.md) · [核心验收](docs/research/core-pilot-acceptance-2026-10-31-hku-computing.md) · [本批改动与限制](docs/progress/local-hku-computing-2026-10-31.md)

[31 日浸会剩余批次](docs/progress/local-hkbu-remaining-2026-10-31.md)、[浸会商科理科批次](docs/progress/local-hkbu-business-science-2026-10-31.md)、[HKUST 方向／模式比较](docs/progress/local-hkust-scoped-matching-2026-10-31.md)及此前研究文件保留当时来源、数量与限制；更早记录见[本地开发历史](docs/progress/local-history-through-2026-10-29.md)。

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
