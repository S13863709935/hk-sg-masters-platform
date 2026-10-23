# CUHK Anthropology / SUSS Management：两条旧试点记录更新

实际查阅日期：2026-10-23。内部数据维护与解释记录，不是课程提交正文、用户研究或独立人工复核。

先检查现有 21 条项目页已查记录，优先选择入学年份、日期或费用缺口较多且仍停留在 10 月 6 日观察的两条记录。不是扩大项目数量，也不代表其他记录已完成核验。结构化观察保存在 `data/research/cuhk-suss-observation-2026-10-23.json`。

## CUHK：MA Anthropology（HK-CUHK-P001）

来源：[研究院项目页](https://www.gs.cuhk.edu.hk/programmes/arts/ma-anthropology)、[一般入学及英语要求](https://www.gs.cuhk.edu.hk/admissions/requirements)、[中央截止表](https://www.gs.cuhk.edu.hk/admissions/application-deadline)、[院系申请页](https://www.arts.cuhk.edu.hk/~ant/programmes/postgraduate/ma/ma-application-information/)、[院系 FAQ](https://www.arts.cuhk.edu.hk/~ant/programmes/postgraduate/postgraduate-programme-faqs/)、[一般申请费](https://www.gs.cuhk.edu.hk/admissions/scholarships-fees/fees)。院系两页在研究工具中报错，但通过只读 HTTPS 请求均返回 200，已核对相关正文，而非只采用搜索摘要。

- 年份按院系正文明确的 September 2027／2027/28，并与中央日期表交叉核对；同页标题仍写 Fall 2026，保留这个不一致，不将其隐藏为完全确认。
- 中央统一开放日为 2026-09-01，例外是 PCLL，不是本项目。MA 五轮截止分别为 2026-09-30、10-31、11-30、12-31、2027-01-31。轮次各自开放日和具体时刻未明示，留空；不使用相邻 MPhil/PhD 的截止日。
- 提前满额可能结束审理，12 月 31 日后的申请取决于余位；最后一轮不是保证仍可申请。网站只比较这些已记录日期，不检查门户。
- 全日制为暂定 HKD 198,000／年，正常一年，保留待批准和非全成本提示；HKD 500 申请费单列。
- 兼读制的研究院／申请页写 HKD 99,000／年，FAQ 却写两年 HKD 99,000。兼读数值继续留空，并在计费说明保留两种写法；不擅自选一项或算两年总额。
- 定性学历等级及平均 B 的替代条件保留人工判断，不换算 GPA；材料、推荐信、语言有效期和豁免继续需要核对。MA 与研究型 MPhil 的专业要求不混用。

全日制、兼读制原有选项 ID 保留。`academicYear` 与 `deadline` 字段取得新的明确证据，但整条记录仍为部分要求、待独立复核；费用未知字段不因补齐日期而自动变为已确认。

## SUSS：Master of Management（SG-SUSS-P001）

来源：[项目页](https://www.suss.edu.sg/programmes/detail/master-of-management-mmgt)、[一般入学规则](https://www.suss.edu.sg/admissions/application-process/eligibility/graduate-admission-criteria)、[研究生费用说明](https://www.suss.edu.sg/admissions/financial-matters/tuition-fee-subsidy/graduate)、[所链接费用表](https://www.suss.edu.sg/docs/default-source/dept_gs/grad_prog_tuition_fee_year_2026.pdf?sfvrsn=9671852c_80)。

- regular 与 accelerated 路径的申请人条件不同，国际申请者不能自动套用 regular；保留面试适合度判断，不从国籍、人在新加坡或晚间授课推断资格及 FT/PT 模式。不新增路径选择功能。
- 同页课程结构与 FAQ 的 normal/accelerated 学制写法不一致，原来的无条件“18 months–4 years”改为冲突提示。两处写法完整保存在观察文件和手动条件中，待学校确认。
- 仍只确认每年 January／July 两个循环月份；未取得该 MMGT 的明确年份及申请起止日。中央精选项目显示的其他项目窗口不能移植过来。
- IELTS 6.5 之外的测试、申请时有效期及英语授课证明在手动条件里保留。纸考 TOEFL 不换成 iBT；CGPA 3.0 是获得硕士学位的毕业要求，不是本科申请门槛。志愿服务偏好不改成必需工作年数。
- 费用表抽取文本的标题实际为 2026/2027，文件名含 2026；不能只看文件名判断适用周期。表中有身份／资助列及 GST、额外费用、年度调整说明。截图未得到可检查图像，直接下载又被安全服务拦截；未绕过限制、未生成本地 PDF，因此没有完成表格视觉核验。
- 数值学费继续留空：精确批次、身份、资助适用性和列对应尚未全部核实。一般规则的接受录取订金会抵扣首学期费用，不再作为额外学费相加。

原有分组和选项 ID 不变，年份、专业政策、费用与截止仍有未知。网页正文可通过研究工具读取，不代表其所有动态字段、申请门户或费用 PDF 均已检查完毕。

## 复核与发布边界

仅上述两条父项目及批次观察日期改变；其余 19 条父项目的内容及各自来源日期保持不变。没有修改原始工作簿、目录种子、路径／申请人侧文件、日常 SQLite 或软件功能。

总库仍为 873／默认 870／父项目页已查 21／独立人工复核 0／完整要求 0。未启用真实项目推荐分档。下一步由实际参与的人打开来源核对冲突及适用性，记录真实姓名和日期；不由自动测试冒充完成。继续本地保存，不推送或部署。
