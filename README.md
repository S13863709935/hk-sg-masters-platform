# HK–SG Masters Platform

香港与新加坡授课型硕士项目信息整合与匹配网站。

用户可以按本科专业、GPA／学位等级和语言成绩筛选项目，查看公开入学要求、费用、申请时间和官方来源，比较课程并保存候选清单。网站不代办申请，不预测录取概率，也不保证录取。

## 当前状态

2026-10-06：本地可运行版本 0.1.0 已实现。网站统一采用英文界面，包含搜索、项目详情、背景输入及逐条件判断、课程比较、候选清单和数据工作台。当前开发工作保存在本地，尚未公开部署。

原始工作簿冻结于 2026-09-29，包含 14 所目标大学的 175 条课程种子，其中只有 1 条标记为项目页已核验。这不是完整课程清单，也不是可直接上线的匹配数据库。旧版加权评分规则尚未验证，不能作为正式招生标准使用。

官方页面更新保存在 `data/checked-programmes.json`，没有改变原始工作簿。首批 20 个直接申请项目覆盖全部 14 校（香港 10、新加坡 10），另保留 HKUST 转入限定 MEng；项目页已查合计 21 条，独立复核和完整条件记录均为 0。MEng 转入路径保留但不在默认搜索显示。

2026-10-08：`data/catalogue-expansion.json` 补入 186 条未核验目录线索，数据库共 361 条，默认浏览 360 条；项目页检查仍为 21，独立复核与完整条件仍为 0。原始 175 条数据没有改动。目录扩展不会覆盖已经存在的用户更新记录。

`data/directory-audit.json` 记录 14 校入口及枚举进度。本轮完成的目录范围计数为 HKBU 49、Lingnan 44、CUHK 129，另保留先前 SIT 4 的计数。PolyU 枚举到 111 个硕士／组合课程条目，但内部学位与待批准项目尚需核对，不能称为最终项目总数。其余学校仍需完整枚举；这些数量不代表全部正在招生。

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
