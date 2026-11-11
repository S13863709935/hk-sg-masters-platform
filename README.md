# HK–SG Masters Platform

完整部署分支：Render免费只读演示配置已完成本机预检，用户已于11月11日授权将完整代码推送至GitHub。推送代码后仍需在Render创建服务，才会获得公网网址。操作步骤及准确表单值见[Render部署指南](docs/deploy-render.md)。本分支保留完整目录；已发布W8与本地运行版不变。

香港与新加坡授课型硕士项目信息整合与匹配网站。

用户可以按本科专业、GPA／学位等级和语言成绩筛选项目，查看公开入学要求、费用、申请时间和官方来源，比较课程并保存候选清单。网站不代办申请，不预测录取概率，也不保证录取。

## 当前状态（2026-11-10）

本地英文网站已实现目录搜索、背景条件比较、课程详情、并排比较、候选保存／恢复和公开资料导出。本轮将原来剩余的202个项目一次完成首轮官方资料整理：NTU83、NUS118、教大MEd1。

- 14校、873条既有目录记录，默认可浏览865条；858条有部分官方项目资料，另15条为12条已有方向证据的分组父记录和3条范围留档。未首轮整理的项目为0；这不表示已覆盖各大学的全部现行学位或完整招生要求。
- 路径／条件视图77组／176份，申请类别仍345组／694类。11月10日维护1,379个单元、25个记录截止临近，已有类别绑定失配0。
- 保留英文／中文、NIE16个教育方向、NUS建筑1年／2年、普通MBA／联合学位及8个LLM方向的差别。未读到的联合学位变体仍只作目录参考；LLM-IBL必需上海学期单独标为范围外，拟停办方向保留待确认。
- 明确分开工作经验硬要求、偏好和替代入学路径；不把毕业／学分转换GPA当本科门槛，不补造GPA量表、TOEFL换算、费用年份、申请日或奖学金折扣。公共政策成功申请者的英语参考水平不作为硬门槛。
- 匹配现在区分“高于”与“大于等于”语言分数；官网明确不接收未毕业申请者时，已知最后一年状态会显示该项缺口。其他允许条件申请的项目维持各自条件。
- 费用／日期／资格冲突及未公布字段继续明确留缺。完整要求集和独立复核均为0；**Recorded comparisons met**只表示已记录比较项满足，没有完整资格、录取概率或保底保证。
- 原核心20个ID、71种选择、7个模拟背景仍有497次比较：125个缺口、372个待确认、0个完整达标、0个违规。

Windows系统解压入口的交付问题已单独修复，后续运行包使用规范ZIP文件条目并提供短路径副本，见[解压兼容性修复](docs/progress/local-windows-zip-fix-2026-11-10.md)。旧包验收没有覆盖系统解压器，不应当作该入口已通过。

11月10日后续集中验收已完成：22个临近截止项目的官方资料复查、小屏完整使用流程、隔离启动环境和三处修复。详情见[本地演示版验收](docs/progress/local-final-use-2026-11-10.md)及[演示说明](docs/local-demo-guide.md)。现有数据规模保持不变，W8发布不变。

[本轮完成与验证](docs/progress/local-singapore-finish-2026-11-10.md) · [本轮来源与范围](data/research/singapore-local-finish-observation-2026-11-10.json) · [逐校状态](docs/research/school-data-backlog-2026-11-10-singapore-finish.md) · [维护清单](docs/research/source-review-queue-2026-11-10-singapore-finish.md) · [本地交付说明](docs/local-finish-plan.md)

W8 阶段版已于11月10日推送至[`checkpoint/week-08`](https://github.com/S13863709935/hk-sg-masters-platform/tree/checkpoint/week-08)，提交`b7b5a4d`，远程SHA已确认。发布版保留20个试点，包含5条来源整合及学习选项／日期／匹配修复，92项检查通过；完整本地扩展版继续分开保留。见[W8实际发布记录](docs/progress/2026-11-10-week-08-publication.md)。后续“继续”仍默认本地开发。

W7 选定阶段版本已于 11 月 3 日推送为 [`checkpoint/week-07`](https://github.com/S13863709935/hk-sg-masters-platform/tree/checkpoint/week-07)，提交 `dff8b54`。该发布保留 20 条直接申请试点，加入比较、候选清单、公开引用导出及 5 条兼容的来源更新。这里的扩展目录和超前功能继续保存在本地；后续“继续”不触发重复小批推送。见[本次发布记录](docs/progress/2026-11-03-week-07-publication.md)。

[11月4日中大／理大整校记录](docs/progress/local-cuhk-polyu-bulk-2026-11-04.md)及[较早工程学院批次](docs/progress/local-cuhk-engineering-2026-11-04.md)保留当时的来源、统计和限制。

[同日教大应用政策研究及教育未来学院批次](docs/progress/local-eduhk-aapsef-2026-11-04.md)、[同日较早教大教育发展与创新学院批次](docs/progress/local-eduhk-aedi-2026-11-04.md)、[同日较早教大博文及社会科学学院批次](docs/progress/local-eduhk-flass-2026-11-04.md)、[同日教大人文学院批次](docs/progress/local-eduhk-fhm-2026-11-04.md)、[较早教大教育及人类发展学院批次](docs/progress/local-eduhk-fehd-2026-11-04.md)、[较早岭南收尾批次](docs/progress/local-lingnan-gs-remainder-2026-11-04.md)保留当时来源、统计和限制。

[3 日岭南人文／社科批次](docs/progress/local-lingnan-arts-social-2026-11-03.md)、[3 日岭南商科／数据科学批次](docs/progress/local-lingnan-business-data-2026-11-03.md)、[同日城大／港大收尾批次](docs/progress/local-cityu-hku-remainder-2026-11-03.md)、[同日 SUTD 批次](docs/progress/local-sutd-school-2026-11-03.md)、[同日港大医学批次](docs/progress/local-hku-medical-law-2026-11-03.md)、[较早理学／创新科技及文科批次](docs/progress/local-hku-science-arts-2026-11-01.md)、[较早传媒与社会服务批次](docs/progress/local-hku-media-social-2026-11-01.md)、[较早教育与政策批次](docs/progress/local-hku-education-policy-2026-11-01.md)、[31 日港大建筑批次](docs/progress/local-hku-architecture-2026-10-31.md)、[31 日港大人文批次](docs/progress/local-hku-humanities-2026-10-31.md)、[31 日港大商科批次](docs/progress/local-hku-business-2026-10-31.md)、[31 日港大工程批次](docs/progress/local-hku-engineering-2026-10-31.md)、[31 日港大计算／数据批次](docs/progress/local-hku-computing-2026-10-31.md)、[浸会剩余批次](docs/progress/local-hkbu-remaining-2026-10-31.md)、[浸会商科理科批次](docs/progress/local-hkbu-business-science-2026-10-31.md)、[HKUST 方向／模式比较](docs/progress/local-hkust-scoped-matching-2026-10-31.md)及此前研究文件保留当时来源、数量与限制；更早记录见[本地开发历史](docs/progress/local-history-through-2026-10-29.md)。

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

后续优先收敛既有项目中的条件与来源冲突，按学校继续批量核对；旧 Housing Management P003 和 CityU 的 EMBA／旧土木身份继续保留待确认依据。HKUST P17 名称批准／费用适用、Financial Mathematics and Statistics 的实际学分及年度负载继续单列，不因等候这些事项阻塞其他分组。14 校全量目录身份、组合／跨地区边界和新增 SMU MPGL 仍待核对。软件变更限于可复现的问题及匹配、数据维护的必要改进，不按每次“继续”增加功能。

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
