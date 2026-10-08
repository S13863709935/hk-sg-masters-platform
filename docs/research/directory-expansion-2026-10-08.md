# 2026-10-08 目录扩展与数据核查记录

这是内部数据研究与开发记录，不是课程提交正文。记录的是实际采集日，不倒记前三周活动或组员贡献。

## 当前结果

- 原始工作簿和 catalogue.json 的 175 条种子保持不变。
- 从官方目录补入 186 条未核验线索，数据库合计 361 条；默认浏览 360 条，另有 1 条转入限定记录。
- 项目页已查仍为 21 条，独立人工复核 0 条，完整入学条件 0 条。目录扩容不等于要求核验完成。
- 以下计数是按本项目范围处理“所查目录”的结果，不是学校官方宣称的课程总数，也不表示当前全部开放申请。

## 已枚举目录

| 学校及来源 | 纳入的硕士目录项目 | 排除／去重依据 |
| --- | ---: | --- |
| [香港浸会大学](https://ar.hkbu.edu.hk/tpg-admissions/programmes) | 49 | 合并跨学院重复；排除 1 个博士和 5 个列明 BNBU／珠海办学项目 |
| [岭南大学](https://www.ln.edu.hk/sgs/programmes-on-offer) | 44 | 排除 5 个博士；方向、concentration 和双学位选项不重复计数 |
| [香港中文大学](https://www.gs.cuhk.edu.hk/programme-filter) | 129 | 取官方 Taught Programmes 栏；排除研究栏、博士、JD／JD-MBA 及明确上海／深圳交付；合并跨院重复 |
| [新加坡理工大学](https://www.singaporetech.edu.sg/admissions/postgraduate) | 4 | 沿用 10 月 6 日对明确 Coursework 表的枚举；本轮未声称再次核验该校全部页面 |

完整条目、排除理由、别名、来源摘要指纹和稳定 ID 映射保存在 data/research/programme-inventory-2026-10-08.json。新增课程仅放入 catalogue-expansion.json，不向它们编造 GPA、语言或本科专业规则。

边界处理：

- 中文大学 MA in Gender Studies 在跨院和社会科学院栏目各展示一次，按一个项目计算，保留两个 URL。
- 目录中共有 9 个 MSSc 缩写项目，现已全部纳入类型读取与回归测试；其中 Advertising／Corporate Communication 仍使用原稳定 ID。
- 中文大学 Master of Music／Master of Fine Arts 位于 Research Programmes 栏，不能只因名称含 Master 就当成授课型项目。
- 岭南 Master of Research in Advanced Data Science 被[数据科学学院明确列在 Taught Postgraduate 类别](https://www.ln.edu.hk/sds/programmes-and-courses)，因此保留；不能只因名称含 Research 就排除。
- JD/MBA 混合学位暂按严格“硕士单独项目”范围排除，不静默扩大到所有研究生资格。
- 目录中的星号、改名或联合项目提示仍需项目页核查；目录存在不等于批准状态、交付地点、申请窗口和入学条件都已完整确认。

## 尚不能称为完整计数的学校

[理工大学官方入口](https://www.polyu.edu.hk/study/pg/taught-postgraduate)枚举到 125 个 2027 年条目，排除 14 个博士后剩 111 个硕士／组合课程条目，其中 5 个明示待批准。组合课程内部学位与方向仍需展开去重，因此不把 111 当作最终硕士总数，也未将这些条目批量导入为已确定项目。

SUTD 两页目录的工具读取与直接页面候选仍需对齐；20 个显示结果中混有研究型 MEng，不能直接采用 20。SMU 的直接读取只得到空壳页面；HKUST 目录依赖动态内容；EdUHK 的院系／学位／语言版本需合并；SUSS 直接请求返回 403，未绕过访问限制。CityU、HKU、NUS、NTU 的全量枚举也未在本轮完成。

没有把读取失败当作“学校没有课程”，也没有把原种子数当作学校总数。

## 首批项目缺失字段更新

岭南 MA International Higher Education and Management：
- [2027/28 招生页](https://www.ln.edu.hk/sgs/ihem/admission)明示学费 HKD 198,000，申请费 HKD 400 单列。
- [项目资料页](https://www.ln.edu.hk/sgs/ihem/programme-overview/programme-information)明示全日制 1 年、非全日制 2 年。
- 资料页的 GPA 2.67／3.50 是毕业等级条件，不作为本科入学最低 GPA。
- 该记录最后核查日更新为 2026-10-08，仍待独立复核，要求覆盖仍为 partial。

## 验证与保存

76 项自动测试通过（含本机可用 Python 解析器的合成 HTML 测试）。覆盖原 ID 保留、目录计数、MSSc 缩写、跨院别名、研究型排除、未知条件、导入保护和全英文界面。目录扩展不会覆盖用户之后手动导入的既有记录。

浏览器已确认英文页面显示 361 条记录、360 条默认可浏览、21 条项目页检查；学校数据工作台保留未知总数和组合课程待核对提示；新增项目没有被标为已达标。没有新增或保存学生背景，没有公开部署、推送 GitHub或伪造人工复核。

下一步继续剩余学校的全量枚举与逐项目要求采集。优先复核招生年份、费用基础、语言有效期锚点和替代条件；目录线索不进入冲刺／保底分类。
