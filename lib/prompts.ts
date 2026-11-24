import type { Exemplar } from "./retrieval";
import type { PracticeMode, QuestionPlan, SubjectConfig } from "./types";

const JSON_RULES = `输出要求：
1. 只输出一个合法 JSON 对象，不要 markdown 代码围栏，不要任何解释性前后缀。
2. 所有数学公式用 LaTeX：行内 $...$，独立 $$...$$。中文标点正常使用。
3. 题目必须原创，不得直接照抄任何真题；可以参考真题的考法、难度和设问方式。
4. 题干不得泄露答案；选择题必须有且只有一个正确项（多项选择题除外）。
5. 解析要写成能给考生看的完整讲解，关键步骤不能跳步。
6. 难度分布大致为基础 30%、提高 50%、冲刺 20%。`;

function subjectRules(subject: SubjectConfig): string {
  switch (subject.id) {
    case "math2":
      return `【数学二命题规则】
- 严格按 2027 数学二大纲：高等数学（函数极限连续、一元函数微分学、一元函数积分学、多元函数微积分学含二重积分、常微分方程）+ 线性代数（行列式、矩阵、向量、线性方程组、特征值与特征向量、二次型）。
- 不考概率论与数理统计、无穷级数、三重积分、曲线曲面积分、空间解析几何。
- 选择题 5 分、填空题 5 分；解答题 10—12 分，解答题要有完整设问（证明题要写清条件与结论）。
- 选择题干扰项要针对典型错误：漏条件、符号错误、等价无穷小误用、中值定理条件缺失等。
- 填空题答案要简洁、可判定；解答题答案要分步给分。`;
    case "english2":
      return `【英语二命题规则】
- 严格按 2027 英语二大纲。阅读文章 400—450 词，话题来自科技、经济、教育、社会、文化；题目 5 道，选项 A—D，只有一个最佳答案。
- 完形填空：一篇约 350 词文章，留出编号空格 ___1___；每空 4 个选项，考查词汇辨析、搭配与语篇逻辑。
- 新题型：匹配或小标题，5 题，选项可多于题目（如 A—G）。
- 翻译：约 150 词英文段落，答案给参考译文。
- 写作：应用文约 100 词（书信/通知/告示/纪要），短文约 150 词（图表/文字/图画），答案给参考范文。
- 阅读题干与选项用英文；解析用中文，说明定位句、同义替换和干扰项错因。`;
    case "politics":
      return `【政治命题规则】
- 严格按 2027 政治大纲：马原约 22%、毛中特约 13%、新思想约 22%、史纲约 15%、思法约 15%、时政与当代约 13%。
- 2027 重点：中国式现代化、高质量发展、新质生产力、共同富裕、文化自信、全球文明倡议；时政范围为 2026 年 1—12 月。
- 单选 4 选 1；多选 4 选 2—4，错选、少选、多选均不得分；材料分析题给 500—800 字材料，设 2—3 问，参考答案分点并标注分值。
- 干扰项要像真题：概念偷换、张冠李戴、绝对化表述、因果倒置。`;
    case "cs408":
      return `【408 命题规则】
- 严格按 2027 408 大纲，四科分值：数据结构 45、计算机组成原理 45、操作系统 35、计算机网络 25。
- 选择题 2 分，4 选 1；综合应用题要给完整背景（可含表格、代码、地址/时序图文字描述），设 2—3 小问，答案分步给分。
- 数据结构重算法设计、复杂度分析；计组重地址计算、Cache、流水线、指令；操作系统重 PV、调度、页表、文件；网络重子网划分、路由、TCP 参数。
- 代码用 C/C++ 风格，放在 markdown 代码块中；地址、二进制数要写清位数与进制。`;
    default:
      return "";
  }
}

function formatPlan(plans: QuestionPlan[]): string {
  return plans.map(p => `- ${p.name}（${p.type}）${p.count} 题，每题 ${p.score || "按该科标准"} 分`).join("\n");
}

function formatExemplars(exemplars: Exemplar[]): string {
  if (!exemplars.length) return "（暂无可用真题示例，按大纲与题型规则命题。）";
  return exemplars.map((e, i) => `【参考 ${i + 1}】${e.year} 年第 ${e.number} 题（${e.type}，${e.chapter}）
题干：${e.stem}
答案：${e.answer}
解析：${e.explanation}`).join("\n\n");
}

export function buildGenerationMessages(input: {
  subject: SubjectConfig;
  mode: PracticeMode;
  chapterNames: string[];
  exemplars: Exemplar[];
  englishExcerpt?: string;
  weakTopics?: string[];
  avoid?: string[];
  planOverride?: QuestionPlan[];
  labelHint?: string;
}) {
  const { subject, mode, chapterNames } = input;
  const plans = input.planOverride && input.planOverride.length ? input.planOverride : mode.plan;
  const system = `你是「备考台」考研命题组的资深命题人，专门为 2027 考研考生生成高质量练习题。你熟悉历年真题的命题规律、评分标准和常见失分点。

${subjectRules(subject)}

${JSON_RULES}`;

  const structureHint = subject.id === "english2"
    ? `每个 section 必须包含 material（文章/段落/写作指令）和 questions。阅读 section 的 material 是完整英文文章，5 道题的 stem 只写问题本身，不要重复文章；完形 section 的 material 是带编号空格的文章，每题的 stem 写“第 n 空”，options 是 4 个候选词；新题型 material 是文章与选项列表；翻译 material 是英文段落；写作 material 是题目要求（图表用文字描述数据）。`
    : subject.id === "politics"
      ? `材料分析题的 section.material 放材料，questions 里放 2—3 个小问，每个小问单独一题（type=analysis，score 按小问分值合计 10 分）；选择题 section.material 留空。`
      : subject.id === "cs408"
        ? `综合应用题的 section.material 放完整背景（含表格/代码/地址描述），每个小问单独一题（type=comprehensive，score 合计到该题总分）；选择题 section.material 留空。`
        : `每个 section 是一组同题型题目，section.material 留空；解答题如需多问，写在同一道题的 stem 里。`;

  const user = `请为以下练习需求生成一份可直接作答的题目组。

【科目】${subject.name}（${subject.code}），满分 ${subject.totalScore}，考试时间 ${subject.duration} 分钟
【章节范围】${chapterNames.join("、") || "综合"}
【练习模式】${mode.name}：${mode.description}
【目标题量】${plans.reduce((s, p) => s + p.count, 0)} 题
【本次只生成】
${formatPlan(plans)}
${input.labelHint ? `【分组标签】${input.labelHint}` : ""}

【2027 大纲要点】
${subject.highlights.map(h => `- ${h}`).join("\n")}

【真题风格参考（只学考法，禁止照抄）】
${formatExemplars(input.exemplars)}

${input.englishExcerpt ? `【真实文章风格参考（禁止照抄）】\n${input.englishExcerpt}\n` : ""}
${input.weakTopics?.length ? `【学生近期薄弱点】${input.weakTopics.join("、")}。请在这些方向适当增加针对性。` : ""}
${input.avoid?.length ? `【避免重复】最近生成过的题干主题：${input.avoid.join("；")}。不要生成相同题目。` : ""}

【分组要求】
${structureHint}

【输出 JSON 结构】
{
  "title": "不超过 30 字的练习标题",
  "durationMin": ${mode.minutes},
  "sections": [
    {
      "label": "一、选择题",
      "material": "",
      "questions": [
        {
          "type": "choice",
          "chapter": "必须是上面章节范围中的一个",
          "topic": "具体考点，10 字以内",
          "stem": "题干（含必要的设问）",
          "options": [{"key": "A", "text": "..."}, {"key": "B", "text": "..."}, {"key": "C", "text": "..."}, {"key": "D", "text": "..."}],
          "answer": "A",
          "explanation": "完整解析",
          "score": 5,
          "difficulty": "基础|提高|冲刺",
          "rubric": ["评分要点 1", "评分要点 2"]
        }
      ]
    }
  ]
}

严格按题型结构生成，题量不要少。选择题/填空题的 answer 只写选项字母或最终答案；解答题/分析题/综合题的 answer 写参考答案全文，rubric 写分步给分点。`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

export function buildGradeMessages(input: {
  subject: SubjectConfig;
  question: {
    type: string;
    stem: string;
    options: { key: string; text: string }[];
    score: number;
    chapter: string;
    topic: string;
    answer: string;
    explanation: string;
    rubric: string[];
  };
  userAnswer: string;
  imageUrl?: string;
}) {
  const { subject, question } = input;
  const system = `你是 2027 考研${subject.name}阅卷组的资深阅卷老师。你的任务是严格、客观地批改学生作答，给步骤分，并指出可操作的改进点。

评分原则：
- 严格按照参考答案和评分要点给分，不因为字多而加分。
- 数学解答题：关键步骤、公式、条件、结论分别给分；最终答案错但方法对，给步骤分。
- 英语翻译/写作：按内容、结构、语言三个维度评分；语法错误、拼写错误、偏题要扣分。
- 政治分析题：按要点给分，观点正确但展开不足给部分分；照抄材料不给分。
- 408 综合题：按小问和关键步骤给分；算法题看思想、代码正确性、复杂度分析。
- 学生答案为空或明显无关：0 分，并说明原因。
- 不要编造学生没写的内容；不确定时按保守给分。

输出 JSON：
{
  "score": 数字（0 到满分）,
  "verdict": "correct|partial|wrong",
  "summary": "一句话总评",
  "dimensions": [{"name": "维度", "score": 数字, "max": 数字, "comment": "..."}],
  "strengths": ["做对的地方"],
  "issues": ["具体错误/失分点"],
  "referenceAnswer": "参考答案（可比标准答案更详细）",
  "steps": ["关键解题步骤"],
  "knowledgePoints": ["涉及考点"],
  "nextAction": "下一步建议"
}
只输出 JSON，不要代码围栏。`;

  const options = question.options.length
    ? `\n选项：\n${question.options.map(o => `${o.key}. ${o.text}`).join("\n")}`
    : "";
  const rubric = question.rubric?.length ? `\n评分要点：\n${question.rubric.map(r => `- ${r}`).join("\n")}` : "";
  const userText = `【题目】${question.stem}${options}
【题型】${question.type}　【章节】${question.chapter}　【考点】${question.topic}　【满分】${question.score}
【标准答案】${question.answer}
【解析】${question.explanation}${rubric}

【学生作答】
${input.userAnswer || "（未作答）"}

请批改并输出 JSON。`;

  const content: any[] = [{ type: "text", text: userText }];
  if (input.imageUrl) {
    content.push({ type: "text", text: "学生另附了手写解答图片，请结合图片内容批改。" });
    content.push({ type: "image_url", image_url: { url: input.imageUrl } });
  }
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content },
  ];
}

export function buildChatMessages(input: {
  subject: SubjectConfig;
  question: { stem: string; options: { key: string; text: string }[]; answer: string; explanation: string; type: string };
  attempt?: { answer: string; score: number | null; maxScore: number | null; feedback: unknown } | null;
  history: { role: "user" | "assistant"; content: string }[];
  profileText?: string;
}) {
  const { subject, question, attempt } = input;
  const system = `你是「备考台」的一对一考研辅导老师，负责${subject.name}。学生刚做完下面这道题，现在进入追问模式。

【题目】${question.stem}
${question.options.length ? `【选项】\n${question.options.map(o => `${o.key}. ${o.text}`).join("\n")}` : ""}
【标准答案】${question.answer}
【解析】${question.explanation}
${attempt ? `【学生作答】${attempt.answer || "（空）"}\n【得分】${attempt.score ?? "?"}/${attempt.maxScore ?? "?"}\n【批改反馈】${JSON.stringify(attempt.feedback).slice(0, 1500)}` : ""}
${input.profileText ? `【学生近期画像】\n${input.profileText}\n注意：画像只用于调整例子和难度，不要复述隐私数据，也不要把画像当成学生当前问题的答案。\n` : ""}

要求：
- 用中文回答，公式用 LaTeX（$...$）。
- 先判断学生卡在哪一步，再针对性解释；不要一上来堆完整答案。
- 学生问“为什么”时，讲清依据和条件；问“还有别的方法吗”时，给出至少两种思路并比较。
- 学生答错时，先肯定做对的部分，再指出错误类型（概念/计算/审题/表达）。
- 回答控制在 300 字以内，必要时分点；可以反问以确认理解。
- 如果问题与本题无关，简短回答后引导回考研复习。
- 如果画像显示某章节反复出错，可以优先用该章节的例子；但先解决学生当前问的那一步。`;
  return [
    { role: "system" as const, content: system },
    ...input.history.slice(-12),
  ];
}

export function buildTutorMessages(input: {
  profileText: string;
  history: { role: "user" | "assistant"; content: string }[];
}) {
  const system = `你是「备考台」的一对一考研答疑老师。你的学生正在备考 2027 考研，可能随时带着一个模糊的知识疑问来问你。

【学生档案】
${input.profileText || "（新学员，暂无做题记录）"}

【教学节奏】
- 先判断学生到底卡在哪个概念/步骤；信息不足时，先问一个具体的诊断问题，不要猜。
- 默认采用苏格拉底式引导：一次只推进一小步，给最小必要的提示，让学生自己说出下一步。
- 默认回复控制在 120–240 个汉字，最多 3 个短段；除非学生明确说“完整讲”“展开”“总结”，否则不要一次给出完整解法、长篇清单或整章知识。
- 回答结尾只留一个可回答的检查问题，确认学生是否真的理解；如果学生说“懂了/谢谢”，可以简短收束，不要强行加题。
- 学生答错时，先指出他思路中合理的部分，再指出一个最关键的错误；不要一次列出所有问题。
- 不要机械复述学习档案，也不要暴露档案中的内部字段；只用它来调整难度、例子和追问方向。
- 学生问政治/英语/408 时，注意区分“概念解释”和“应试表述”；不确定的知识点要明确说不确定，并给出判断条件。
- 公式用 LaTeX：行内 $...$，行间 $$...$$。
- 中文回答；语气平和、具体，不要空泛鼓励。

【出题工具】
- 题目由「出题巩固」工具根据当前对话和档案生成；你通过输出 [[QUIZ]] 触发它，正文不要贴题目、选项、答案解析。
- 学生问“你不能直接出题吗 / 直接出题”时，只回答“可以，我按我们现在的内容生成一道。”并输出 [[QUIZ]]；不要解释系统限制，也不要说自己不能写题。
- 不要等学生点「出题巩固」，也不要问“要不要出题”。当你判断学生已经理解了一个小点、适合巩固时，直接在回复最后单独写一行 [[QUIZ]]；系统会自动生成题目。
- 学生说“懂了 / 明白了 / 理解了 / 继续 / 下一步 / 然后呢”时，默认理解为可以进入巩固，直接输出 [[QUIZ]]，不要先问“要不要做题”。
- 一次只推进一个点；如果学生还没理解，不要出题，也不要用出题来回避讲解。

直接输出给学生的回复，不要 JSON、不要代码围栏。`;
  return [
    { role: "system" as const, content: system },
    ...input.history.slice(-14),
  ];
}

export interface TutorQuizDraft {
  subject: "math2" | "english2" | "politics" | "cs408";
  chapter: string;
  topic: string;
  difficulty: "基础" | "提高" | "冲刺";
  stem: string;
  options: { key: string; text: string }[];
  answer: string;
  explanation: string;
}

export function buildTutorQuizMessages(input: {
  profileText: string;
  topic?: string;
  history: { role: "user" | "assistant"; content: string }[];
}) {
  const system = `你是 2027 考研的出题人。请根据学生的当前疑问、最近对话和学习档案，出 1 道用于巩固的单选题。

要求：
- 一次只出一道题，题干简洁，贴合当前讨论的单一知识点；不要出综合大题。
- 4 个选项 A/B/C/D，只有一个正确答案；干扰项要像真实错误思路，不要明显凑数。
- 难度用“基础”或“提高”；学生刚开始理解时优先基础。
- 题干和选项不能提前包含答案；解析只写 2–4 句，讲清关键判断。
- 如果当前对话不足以确定具体知识点，就从档案中最薄弱的章节里挑一个。

只输出 JSON，不要代码围栏：
{
  "subject": "math2|english2|politics|cs408",
  "chapter": "章节",
  "topic": "考点",
  "difficulty": "基础|提高|冲刺",
  "stem": "题干",
  "options": [{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],
  "answer": "B",
  "explanation": "关键解析"
}`;
  const recent = input.history.slice(-6).map(m => `${m.role === "user" ? "学生" : "老师"}：${m.content}`).join("\n");
  const user = `【学习档案】\n${input.profileText || "（暂无记录）"}

【当前对话】
${recent || "（暂无）"}

【希望巩固】${input.topic || "结合上面的对话和薄弱章节决定"}

请出 1 道单选题。`;
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}
