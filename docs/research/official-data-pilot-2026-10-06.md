# 官方数据第一批核查记录（内部开发用）

核查日期：2026-10-06。用于数据采集、程序开发和复核，不是课程提交正文。

## 本次实际完成

- 检查 14 所目标学校的目录入口，记录失效、改址、局部目录和工具读取受限问题。
- 第一批 20 个直接申请项目：香港 10 个、新加坡 10 个，覆盖全部 14 校。
- 网站保留原来的 175 条记录，默认浏览 174 条。20 个试点加 1 条转入限定记录，共 21 条标记为项目页已查。
- 19 条原来只有目录线索的记录升级为项目页已查；已有 HKUST MSc 更新并纳入本批。
- 独立复核 0 条，完整要求记录 0 条。页面已查不等于可以作完整达标判断。
- 原始 XLSX 和 catalogue.json 均未修改；采集结果是另外维护的可追溯导入层。

## 学校目录入口与计数进度

范围按[香港 UGC 名单](https://www.ugc.edu.hk/eng/ugc/site/fund_inst.html)与[新加坡 MOE 自治大学资料](https://www.moe.gov.sg/-/media/files/about-us/esd-2025.pdf)定义。公共资助的是学校范围，不意味着每一个硕士项目都由政府补贴。

| 学校 | 目录入口 | 原有种子数 | 目前可确认的完整目录计数 | 入口状态 |
| --- | --- | ---: | --- | --- |
| CityU | [官方入口](https://www.cityu.edu.hk/pg/taught-postgraduate-programmes/list) | 10 | 尚未完成全量枚举 | 官方索引已查；直接访问受限 |
| HKBU | [官方入口](https://ar.hkbu.edu.hk/tpg-admissions/programmes) | 7 | 尚未完成全量枚举 | 入口已查 |
| Lingnan | [官方入口](https://www.ln.edu.hk/sgs/programmes-on-offer) | 9 | 尚未完成全量枚举 | 入口已查 |
| CUHK | [官方入口](https://www.gs.cuhk.edu.hk/programme-filter) | 20 | 尚未完成全量枚举 | 入口已查 |
| EdUHK | [官方入口](https://www.eduhk.hk/acadprog/postgrad/) | 3 | 尚未完成全量枚举 | 入口已查 |
| PolyU | [官方入口](https://www.polyu.edu.hk/study/pg/taught-postgraduate) | 11 | 尚未完成全量枚举 | 入口已查 |
| HKUST | [官方入口](https://prog-crs.hkust.edu.hk/pgprog) | 4 | 尚未完成全量枚举 | 入口已查 |
| HKU | [官方入口](https://portal.hku.hk/tpg-admissions/programme-listing) | 23 | 尚未完成全量枚举 | 工具读取受限 |
| NUS | [官方入口](https://study.nus.edu.sg/programme) | 34 | 尚未完成全量枚举 | 工具读取受限 |
| NTU | [官方入口](https://www.ntu.edu.sg/admissions/graduate/coursework) | 22 | 尚未完成全量枚举 | 入口已查 |
| SMU | [官方入口](https://masters.smu.edu.sg/programmes) | 10 | 尚未完成全量枚举 | 入口已查 |
| SUTD | [官方入口](https://www.sutd.edu.sg/admissions/graduate/masters) | 5 | 尚未完成全量枚举 | 入口已查 |
| SIT | [官方入口](https://www.singaporetech.edu.sg/admissions/postgraduate) | 4 | 4 | 入口已查 |
| SUSS | [官方入口](https://www.suss.edu.sg/academics/programmes/graduate-programmes/programmes) | 13 | 尚未完成全量枚举 | 入口已查 |

只有 [SIT 的明确 coursework 表](https://www.singaporetech.edu.sg/admissions/postgraduate)目前完成该表的逐项计数：4 个硕士。其余 13 校仍需全量枚举、去重和范围筛选，不能把上表种子数相加称为港新课程总数。

SMU 的学校分类标题合计显示 18 个研究生条目；SUTD 入口显示 20 个结果。这两者混有非本范围或需要进一步判型的条目，因此不作为已确认的授课型硕士总数。

关键入口修正：

- HKBU：原 Graduate School 地址主要列研究型项目，改用 Academic Registry 的 taught postgraduate 目录。BNBU 珠海单独办学地点不能自动纳入香港交付范围。
- Lingnan：原 School of Graduate Studies 小目录仅包含部分项目，换成大学各院系总目录。
- HKU：新招生 portal 在当前研究工具中读取受限，使用院系官方招生页采集；不能据此宣称全部目录已经枚举。
- NUS：旧目录改址到 Study@NUS，动态列表未被当前工具完整读取；已使用院系官方项目页。
- NTU：新项目 highlights 不是完整目录；后续需核对完整列表、分页及 NIE 等单位。

详细问题记录见 data/directory-audit.json。

## 首批项目及可追溯来源

| 稳定 ID | 学校 | 项目及本次主来源 | 适用周期 | 状态 |
| --- | --- | --- | --- | --- |
| HK-CITYU-P010 | CityU | [MSc Computer Science](https://www.cb.cityu.edu.hk/en/pg/programme/program-list/2027/college-of-computing/department-of-computer-science/p53) | 2027/28 | 待独立复核；条件部分采集 |
| HK-CITYU-P004 | CityU | [MSc Applied Economics](https://www.cb.cityu.edu.hk/en/pg/programme/program-list/2027/college-of-business/department-of-economics-and-finance/p13) | 2027/28 | 待独立复核；条件部分采集 |
| HK-HKBU-P001 | HKBU | [MA Communication](https://ar.hkbu.edu.hk/tpg-admissions/programmes/master-of-arts-ma-in-communication) | 2027/28 | 待独立复核；条件部分采集 |
| HK-HKBU-P007 | HKBU | [MSc Business Management](https://ar.hkbu.edu.hk/tpg-admissions/programmes/master-of-science-msc-in-business-management) | 2027/28 | 待独立复核；条件部分采集 |
| HK-LU-P001 | Lingnan | [MA International Higher Education and Management](https://www.ln.edu.hk/sgs/ihem/admission) | 2027/28 | 待独立复核；条件部分采集 |
| HK-CUHK-P001 | CUHK | [MA Anthropology](https://www.gs.cuhk.edu.hk/programmes/arts/ma-anthropology) | Intake year not stated in checked programme details | 待独立复核；条件部分采集 |
| HK-EDUHK-P001 | EdUHK | [Master of Public Policy and Management](https://www.eduhk.hk/ssps/mppm) | January 2027 (2026/27); September 2027 (2027/28) | 待独立复核；条件部分采集 |
| HK-POLYU-P001 | PolyU | [MSc Business Management](https://www.polyu.edu.hk/study/pg/tpg/2027/02022-mmf-mmp) | 2027/28 | 待独立复核；条件部分采集 |
| HK-HKUST-P002 | HKUST | [MSc Digital and Sustainable Cities](https://prog-crs.hkust.edu.hk/pgprog/2026-27/msc-meng-disc) | 2026/27 | 待独立复核；条件部分采集 |
| HK-HKU-P007 | HKU | [MSc Urban Analytics](https://www.arch.hku.hk/programmes/upad/master-of-science-in-urban-analytics/admission/) | 2027/28 | 待独立复核；条件部分采集 |
| SG-NUS-P029 | NUS | [Master of Computing (General Track)](https://www.comp.nus.edu.sg/programmes/pg/mcomp-gen/admissions/) | 2027/28 | 待独立复核；条件部分采集 |
| SG-NUS-P007 | NUS | [MSc Finance](https://mscfin.nus.edu.sg/admissions/admission-requirements/) | 2027/28 | 待独立复核；条件部分采集 |
| SG-NTU-P018 | NTU | [MSc Information Systems](https://www.ntu.edu.sg/education/graduate-programme/master-in-science-in-information-systems) | Intake year not explicitly stated in checked requirements | 待独立复核；条件部分采集 |
| SG-NTU-P015 | NTU | [MSc Applied Economics](https://www.ntu.edu.sg/education/graduate-programme/master-of-applied-economics) | Intake year not explicitly stated in checked requirements | 待独立复核；条件部分采集 |
| SG-SMU-P001 | SMU | [Master of Professional Accounting](https://masters.smu.edu.sg/programme/master-of-professional-accounting) | Current page; applicable tuition cohort to confirm | 待独立复核；条件部分采集 |
| SG-SMU-P010 | SMU | [Master of IT in Business](https://masters.smu.edu.sg/programme/master-of-it-in-business) | Current page; applicable tuition cohort to confirm | 待独立复核；条件部分采集 |
| SG-SUTD-P001 | SUTD | [Master of Architecture](https://www.sutd.edu.sg/programme-listing/master-of-architecture-programme/) | 2027 intake | 待独立复核；条件部分采集 |
| SG-SUTD-P002 | SUTD | [MSc Technology and Design (Human-Centred AI for Venture Innovation)](https://www.sutd.edu.sg/programme-listing/mtd-human-centred-ai-for-venture-innovation/application/) | 2026/27 | 待独立复核；条件部分采集 |
| SG-SIT-P002 | SIT | [MSc Civil Engineering](https://www.singaporetech.edu.sg/postgraduate-programmes/master-science-civil-engineering) | January 2027 intake | 待独立复核；条件部分采集 |
| SG-SUSS-P001 | SUSS | [Master of Management](https://www.suss.edu.sg/programmes/detail/master-of-management-mmgt) | Current page; intake year to confirm | 待独立复核；条件部分采集 |

所有项目均保留单独的来源清单、访问日期、规则、费用计费方式、申请轮次注释和字段缺失状态。以上英文项目名是网站显示名，不声称它们是 14 校全部课程。

## 必须保留的限制

1. 未看到数字 GPA 门槛，就标记“所查来源未明示”，不填入假设门槛；定性的 good degree、荣誉等级、平均 B 或先修条件仍然有意义。
2. 学位等价、相关本科领域和不同学术条件的 OR 路径需要学校或人工判断，不进行 GPA 与 honours/字母等级的换算。
3. 毕业 GPA、课程中选修论文所需 GPA、奖学金 GPA、指定学校毕业生免考试 GPA 不导入通用本科入学门槛。
4. 年度循环的月份只有在来源明确年份时才转成 YYYY-MM-DD；否则留空并保存循环窗口说明。
5. 学费保留 total/annual/per-credit、GST、local/non-local/SC/PR/国际生、待批准及额外费用说明。来源只显示当前价格却未说明适用批次时，仍标为周期待确认。
6. IELTS 总分与单项分别检查。TOEFL 新旧量表按考试日期分开，不猜学校尚未公布的新量表分数。
7. 语言成绩有效期有申请日、offer 日或入学年 9 月 1 日等不同锚点。当前只把可比较的分数放入自动检查，锚点和豁免保留为人工确认项。
8. 已过截止日期是项目申请窗口信息，不是学生的学术资格不合格；不生成录取概率或保证。

## 下一批工作

- 完成剩余 13 校的全量目录枚举；记录每项纳入/排除原因、重复和改名。
- 补查缺失的学费、学制、当期招生窗口、语言替代条件和必需材料；确认适用年份。
- 由本人或其他实际参与者打开来源逐条复核，记录真实复核人和时间。不自动填组员名字。
- 复核完成后再决定哪些规则完整到足以给出“已记录条件满足”；仍有未知条件时保持需确认。
- 网站界面继续保持全英文，内部采集说明可以使用中文。
