# HK–SG Masters Platform

香港与新加坡授课型硕士项目信息整合与匹配网站。

用户可以按本科专业、GPA／学位等级和语言成绩筛选项目，查看公开入学要求、费用、申请时间和官方来源，比较课程并保存候选清单。网站不代办申请，不预测录取概率，也不保证录取。

## 当前状态

2026-10-05：仓库初始化，整理前三周已有资料和后续开发任务。目前只有项目文档及课程目录种子，尚无可运行网站。

原始工作簿冻结于 2026-09-29，包含 14 所目标大学的 175 条课程种子，其中只有 1 条标记为项目页已核验。这不是完整课程清单，也不是可直接上线的匹配数据库。旧版加权评分规则尚未验证，不能作为正式招生标准使用。

## 文档入口

- [项目范围与功能需求](docs/scope-and-requirements.md)
- [团队分工与协作方式](docs/team-and-workflow.md)
- [项目周历与开发任务](docs/calendar-and-backlog.md)
- [前三周回顾](docs/progress/weeks-01-to-03.md)
- [数据字段与匹配原则](docs/data-and-matching.md)
- [现有数据及限制](data/README.md)
- [如何提交修改](CONTRIBUTING.md)

## 下一步

1. 全体成员核对前三周回顾，补充实际发生的活动及可用证据。
2. 确定字段和核验规则，开始盘点全部 14 所学校的目录。
3. 先核验 10–20 个代表性课程，验证采集方法和匹配流程，再扩大覆盖。
4. 三位 CP 成员确认熟悉的技术、运行方式和接口，然后搭建可运行网站。

代表性课程用于验证方法，不替代最终的 14 校覆盖范围。技术栈、托管方式和用户档案保存方式尚未确认。

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
