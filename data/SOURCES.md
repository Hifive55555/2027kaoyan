# 数据来源与处理说明

本项目只做个人备考用途，不主张对真题原文的任何版权。材料来自公开 GitHub 仓库与公开真题页面；如权利方认为不合适，请在仓库 issue 中说明，我们会删除对应内容。

## 覆盖范围

| 科目 | 年份 | 题量 | 说明 |
| --- | --- | --- | --- |
| 思想政治理论（101） | 2006—2026 | 798 | 每年 38 题；分析题给参考要点 |
| 英语（二）（204） | 2010—2026 | 816（按 48 题/年计） | 英语二自 2010 年开考；含答案、参考译文、写作范文 |
| 数学（二）（302） | 2006—2026 | 478 | 含选择、填空、解答；公式为 LaTeX |
| 408（计算机学科专业基础） | 2009—2026 | 846 | 408 自 2009 年开考；含单选与综合应用 |

> 数学、政治的题库覆盖 2006—2026；英语二从 2010 年开考、408 从 2009 年开考，因此按实际开考年份覆盖。

## 原始来源

| 科目 | 来源 | 用途 |
| --- | --- | --- |
| 数学二 | [gtqbhksl/22408](https://github.com/gtqbhksl/22408) `math/exam_data.js` | 1987—2026 数二题库，含答案与解析；本项目取 2006—2026 |
| 英语二随机短题 | AI 生成种子（本项目） | 60 道词汇/语法/短语/句型四选一，用于随机刷题与 1v1，非真题 |
| 英语二 | [Echo1LZJY/echo-kaoyan-english-skill](https://github.com/Echo1LZJY/echo-kaoyan-english-skill) `references/papers/english-ii` | 2010—2026 试题文本、客观题答案、参考译文、写作范文 |
| 政治 | [Nishino0525Nanase/kaoyan-politics](https://github.com/Nishino0525Nanase/kaoyan-politics) `dist/questions.json` | 2007—2026 共 760 题，含题型/专题/答案/参考要点 |
| 政治 2006 | 新东方网公开真题页 | 2006 年 38 题及解析，脚本解析为结构化数据 |
| 408 | [gtqbhksl/22408](https://github.com/gtqbhksl/22408) `408/questions_data.js` | 2009—2025 共 799 题，含答案与解析 |
| 408 2026 | [neville-studio/408-exam-paper](https://github.com/neville-studio/408-exam-paper)、[CHNragdoll/anki-pipeline](https://github.com/CHNragdoll/anki-pipeline) | 2026 试题文本与公开答案详解 |
| 2027 大纲 | [CHNragdoll/anki-pipeline releases](https://github.com/CHNragdoll/anki-pipeline/releases) | 2027 数学二、英语二、政治、408 大纲 PDF，提取为 Markdown |

## 处理方式

1. **数学二**：从 `exam_data.js` 解析 `[年份, 题型, 题号, 题干, 答案, 解析]`，清理题号/选项/嵌入答案，按 11 个章节做规则分类，输出 `data/bank/math2.json` 与 `data/corpus/math2/<year>.md`。
2. **英语二**：保留 Echo 的原始 Markdown 分节文件；另外生成每年合卷 `data/corpus/english2/<year>.md`，把试题、答案表、参考译文、写作范文放在同一文件，方便 AI 阅读。
3. **政治**：把 Nishino 的 JSON 转成统一字段；2006 年从公开页面解析 16 单选 + 17 多选 + 5 分析题；输出题库与年度 Markdown。
4. **408**：把 22408 题库的 HTML 题干/解析转成 Markdown（代码块、表格、选项），题图保留原始 URL 或标注缺失；2026 年从 PDF 文本与答案详解补齐。
5. **大纲**：下载 2027 四科大纲 PDF，提取文本到 `data/syllabus/*-2027.md`，并在 `2027.json` 中整理成章节树、题型结构与分值。

## 质量与限制

- 题库来自公开整理，可能有 OCR/转录错误；数学 2018/2020 等年份的选项与答案从源文件的嵌入标记中恢复。发现错漏请以原卷和官方答案为准。
- 数学 2026、408 2026 等近年题目可能来自回忆版或公开整理版，个别题目标注为“见解析”或缺少题图。
- 英语二的参考译文、写作范文为第三方 AI 生成，非官方答案，只用于学习参考。
- 政治分析题参考答案为公开资料整理，非官方评分细则。
- 408 的部分题图（树、流水线、网络拓扑）未随文本保存；Markdown 中保留图片引用或缺失提示。
- 所有题目、解析仅用于个人学习，不用于商业用途。

## 扩展知识点与题库（2026-11 更新）

以下仓库用于扩充 408、数学二、英语的知识点和图片题库：

| 来源 | 内容 | 本项目用途 |
| --- | --- | --- |
| [jlshdsdk/relax-1000](https://github.com/jlshdsdk/relax-1000) | 408 1000题，含题干/选项/解析/题图 | `data/bank/cs408-external.json` |
| [jlshdsdk/kaoyan-408-os](https://github.com/jlshdsdk/kaoyan-408-os) | 操作系统带学站 + 章末习题 | 408 扩展题 + 知识点 |
| [jlshdsdk/kaoyan-408-coa](https://github.com/jlshdsdk/kaoyan-408-coa) | 计算机组成原理带学站 + 章末习题 | 408 扩展题 + 知识点 |
| [jlshdsdk/kaoyan-408-networks](https://github.com/jlshdsdk/kaoyan-408-networks) | 计算机网络带学站 + 章末习题/图 | 408 扩展题 + 知识点 |
| [jlshdsdk/data-structure-site](https://github.com/jlshdsdk/data-structure-site) | 王道数据结构同步精讲 + 期末题 | 408 知识点 |
| [jlshdsdk/kaoyan-408-ds](https://github.com/jlshdsdk/kaoyan-408-ds) | 408 数据结构动画/代码/讲义 | 408 知识点补充 |
| [jlshdsdk/sanda-jisuan](https://github.com/jlshdsdk/sanda-jisuan) | 考研数学三大计算 821 题 | `data/bank/math2-external.json` |
| [jlshdsdk/zhangyu-1000t](https://github.com/jlshdsdk/zhangyu-1000t) | 张宇 1000题（数一题源） | 按数二范围筛选后加入数学题库 |
| [jlshdsdk/kira-past-papers](https://github.com/jlshdsdk/kira-past-papers) | 数学真题切片，题干为图片 | 图片题题库，保留原图 |
| [jlshdsdk/zhangyu-math-zero-basics](https://github.com/jlshdsdk/zhangyu-math-zero-basics) | 张宇基础30讲零基础部分 | 数学二知识点 |
| [jlshdsdk/zhangyu-30jiang-selfstudy](https://github.com/jlshdsdk/zhangyu-30jiang-selfstudy) | 张宇基础30讲自学版 | 数学二知识点 |
| [jlshdsdk/english-sentences](https://github.com/jlshdsdk/english-sentences) | 斌斌66句 + Monkey百句 | 英语二长难句知识点 |
| [jlshdsdk/kaoyan-vocab5](https://github.com/jlshdsdk/kaoyan-vocab5) | 五书合一 9404 词 | 英语二词汇知识点 |
| [jlshdsdk/kaoyan-vocab](https://github.com/jlshdsdk/kaoyan-vocab) | 红宝书/真题词汇单页 | 与 vocab5 重叠，保留来源记录 |

### 题图处理

- 导入 HTML 题库时，先把 `<img>`/`src` 指向的本地图片复制到 `public/assets/external/<source>/...`，再在题干、选项或解析中写入标准 Markdown 图片：`![题图](/assets/external/...)`。
- 对于 Kira 这类「题干本身就是一张扫描图」的来源，不强行 OCR 成文字；题库保存原图，复习时按原图作答，避免 OCR 把公式和图形弄错。
- 知识点页面与随机刷题共用 `Markdown` 渲染器，图片能直接显示；AI 检索会优先使用同一条目中的文字，图片题以标题/来源作为语义锚点。
- 重新生成：先 `bash scripts/fetch-external.sh`，再 `npm run data:external`。
