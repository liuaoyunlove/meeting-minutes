/**
 * 本地摘要引擎 —— 不联网也能从会议文字中抽出结构化纪要。
 * 纯规则 / 词频启发式，输出可直接编辑。
 */

const ZH_CUES = [
  { w: 3.0, re: /(决定|确定|结论|达成|一致同意|通过|批准|拍板|敲定)/ },
  { w: 2.2, re: /(负责|牵头|跟进|落实|执行|交付|完成|截止|deadline|排期)/i },
  { w: 1.9, re: /(风险|阻塞|延期|困难|问题|隐患|卡点)/ },
  { w: 1.4, re: /(计划|目标|方案|预算|资源|里程碑|下一步|下阶段)/ },
  { w: 1.0, re: /(需要|应该|必须|建议|确认|同步|评审)/ },
];

const EN_CUES = [
  { w: 3.0, re: /\b(decided|decision|agreed|agree|approved|conclusion|finali[sz]ed)\b/i },
  { w: 2.2, re: /\b(owner|owns|responsible|assigned|action item|deliver|deadline|due|by (?:eod|end))\b/i },
  { w: 1.9, re: /\b(risk|blocker|blocked|delay|issue|concern|problem|gap)\b/i },
  { w: 1.4, re: /\b(plan|goal|budget|timeline|milestone|next step|scope|phase)\b/i },
  { w: 1.0, re: /\b(need|should|must|recommend|confirm|review|sync)\b/i },
];

const ZH_DECIDE = /(决定|确定|结论|达成一致|一致同意|通过了?|批准|拍板|敲定|定了)/;
const ZH_RISK = /(风险|阻塞|卡点|延期|隐患|困难|问题在于|担心)/;
const ZH_ACTION = /(负责|牵头|跟进|落实|交付|提交|对接|排期|截止|之前|前完成|完成|安排|搭好|推进)/;
const ZH_NEXT = /(下一步|下阶段|接下来|后续安排|下次例会|下次会议)/;
const EN_DECIDE = /\b(decided|decision|agreed|approved|conclusion)\b/i;
const EN_RISK = /\b(risk|blocker|blocked|concern|issue|delay)\b/i;
const EN_ACTION = /\b(owner|responsible|assigned|action item|deliver|follow up|due|deadline)\b/i;
const EN_NEXT = /\b(next step|next phase|follow[- ]?up|next meeting|next week's review)\b/i;

const STATUS_ONLY = /(已经|已上线|已完成|已确认|已修复|已发布|灰度)/;
const ACTION_SOFT = /(我|我们|请你?|需要|安排|记得|务必|负责|尽快|今天|今晚|明天|本周|下周)/;

const DUE_RE = [
  /(本周[一二三四五六日天]?|这周[一二三四五六日天]?|下周[一二三四五六日天]?|周[一二三四五六日天]|下个?月|月底|月末|季末|季度末|今天|今晚|明天|后天|大后天)/,
  /(\d{1,2}\s*月\s*\d{1,2}\s*[日号])/,
  /(\d{4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2})/,
  /\b(by\s+(?:eod|end of (?:day|week|month)|(?:next\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day|\w+ \d{1,2}|\d{1,2}\/\d{1,2}))\b/i,
  /\b((?:next\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b/i,
  /\b(Q[1-4]|H[12])\b/,
];

const ZH_OWNER = [
  /由\s*([\u4e00-\u9fa5A-Za-z]{2,6})\s*(?:负责|牵头|跟进|来跟进|来负责|落实)/,
  /([\u4e00-\u9fa5A-Za-z]{2,6})\s*(?:负责|牵头|来负责|来跟进|落实)/,
  /请\s*([\u4e00-\u9fa5A-Za-z]{2,6})\s*(?:跟进|确认|处理|对接|负责)/,
];
const EN_OWNER = [
  /\b(?:owner|assigned to|action)\s*[:：]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:will|is going to|to)\b/,
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:owns|takes|handles)\b/,
];

const SELF_OWNER = /(我负责|我来|我这边|我去|我会|我把|I will|I'll|I am going to|I'm going to)/i;

const CJK_STOP = new Set(
  '的了是在和与及或就都也还很太最更又再才只把被让给对从向于为以之其这那有没不要会能可做说看讲想需要应该么呢吧啊嘛吗哦呀嗯然后就是什么因为所以但是如果我们他们你们大家这个那个现在一下一个没有不是还是已经时候请问各位首先其次最后同步，。！？、；：'
    .split('')
);

const PARTICLE_HEAD = new Set('的了是在和与及或就都也还很太最更又再才只把被让给对从向于为以之其这那们个些'.split(''));
const PARTICLE_TAIL = new Set('的了是在和与及或就都也还很太最更又再才只被让给对从向于为以之这那们前时候后好完过吗呢吧啊'.split(''));

const EN_STOP = new Set(
  ('the a an and or but if then than that this these those to of in on at for with by from as is are was were be been being ' +
   'we you they i he she it our your their its will would should could can may might must do does did have has had ' +
   'not no yes ok okay so just very much more most about into over under again also there here what which who whom ' +
   'when where why how all any both each few other some such only own same too don now think know get got make made ' +
   'going today tomorrow week month next last first also right okay sure yeah thing things lot bit').split(' ')
);

const EN_BAN = new Set(
  ('decided agree agreed decision update review share ship freeze plan plans need needs going move moved today tomorrow ' +
   'week weeks month months next last monday tuesday wednesday thursday friday saturday sunday ' +
   'january february march april june july august september october november december').split(' ')
);

const META_PREFIX = /^(参会|参会人|参与者|出席|列席|时间|日期|地点|主题|议题|议程|主持人|记录人|attendees?|participants?|date|time|location|agenda|title|subject)\s*[：:]\s*/i;

/* ── 基础工具 ───────────────────────────────── */

export function cjkRatio(text) {
  const t = String(text || '');
  if (!t) return 0;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (t.match(/[A-Za-z]/g) || []).length;
  if (!cjk && !latin) return 0;
  return cjk / (cjk + latin);
}

export function detectLang(text) {
  const r = cjkRatio(text);
  if (r > 0.65) return 'zh';
  if (r < 0.15) return 'en';
  return 'mixed';
}

/** 切句 + 解析说话人；返回 [{ text, speaker }] */
export function parseSegments(text, skipLines) {
  const out = [];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (skipLines && skipLines.has(line)) continue;
    if (META_PREFIX.test(line)) continue;          // 会议信息行，不当正文

    const m = line.match(/^([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z\s.·\-]{0,14})[：:]\s*(.+)$/);
    const speaker = m ? m[1].trim() : '';
    const body = m ? m[2].trim() : line;

    let parts = body.split(/(?<=[。！？!?；;])/);
    parts = parts.flatMap(p => (p.length > 140 ? p.split(/(?<=[.!?])\s+(?=[A-Z"“(\[])/) : [p]));

    for (let p of parts) {
      p = p.trim();
      if (p.length >= 5) out.push({ text: p, speaker });
    }
  }
  return out;
}

export function splitSentences(text) {
  return parseSegments(text).map(s => s.text);
}

/** 从开头几行里认领「标题 / 参会人」，避免它们混进正文 */
export function readHeader(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 8);
  let attendees = '';
  let title = '';
  const skip = new Set();

  for (const line of lines) {
    const am = line.match(/^(?:参会人员?|参会人|出席人员|出席|列席|attendees?|participants?|present)\s*[：:]\s*(.+)$/i);
    if (am && !attendees) { attendees = am[1].trim(); skip.add(line); continue; }
    if (!title && line.length <= 48 && !/[。！？!?]$/.test(line) && !/[：:]/.test(line)) {
      title = line;
      skip.add(line);
    }
  }
  return { title, attendees, skip };
}

export function splitClauses(text) {
  return String(text || '').split(/[，,、；;。！？!?]/).map(s => s.trim()).filter(Boolean);
}

function bigrams(s) {
  const t = s.replace(/\s+/g, ' ').trim();
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

function similarity(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return hit / Math.min(A.size, B.size);
}

function uniqBySim(items, textOf, threshold = 0.62) {
  const kept = [];
  for (const it of items) {
    const t = textOf(it);
    if (kept.some(k => similarity(t, textOf(k)) >= threshold)) continue;
    kept.push(it);
  }
  return kept;
}

/* ── 句子打分 ───────────────────────────────── */

function scoreSentence(s) {
  let score = 0;
  for (const c of ZH_CUES) if (c.re.test(s)) score += c.w;
  for (const c of EN_CUES) if (c.re.test(s)) score += c.w;

  if (DUE_RE.some(re => re.test(s))) score += 1.6;
  if (/\d/.test(s)) score += 0.6;

  const len = s.length;
  if (len < 12) score -= 1.2;
  else if (len > 220) score -= 1.0;
  else if (len >= 20 && len <= 110) score += 0.8;

  return score;
}

/* ── 关键词 ─────────────────────────────────── */

function isTermLike(g) {
  if (g.length < 2 || g.length > 5) return false;
  if (PARTICLE_HEAD.has(g[0]) || PARTICLE_TAIL.has(g[g.length - 1])) return false;
  if (/^\d+$/.test(g)) return false;
  let func = 0;
  for (const ch of g) if (CJK_STOP.has(ch)) func++;
  if (func / g.length > 0.3 && g.length <= 3) return false;
  return true;
}

function extractTopics(sentences, blacklist) {
  const raw = new Map();   // 出现次数
  const bump = (t) => raw.set(t, (raw.get(t) || 0) + 1);

  for (const s of sentences) {
    for (const c of splitClauses(s)) {
      for (const w of (c.match(/[A-Za-z][A-Za-z-]{3,}/g) || [])) {
        const k = w.toLowerCase();
        if (EN_STOP.has(k) || EN_BAN.has(k) || k.length < 4) continue;
        bump(k);
      }

      for (const run of (c.match(/[\u4e00-\u9fff]{2,}/g) || [])) {
        for (let n = 2; n <= 5; n++) {
          for (let i = 0; i + n <= run.length; i++) {
            const g = run.slice(i, i + n);
            if (isTermLike(g)) bump(g);
          }
        }
      }
    }
  }

  // 去掉人名 / 停用词 / 纯日期
  for (const key of [...raw.keys()]) {
    if (blacklist.has(key)) raw.delete(key);
    if (/^[a-z]+$/.test(key) && EN_STOP.has(key)) raw.delete(key);
    if (/^(周[一二三四五六日天]|本周|下周|这周|今天|明天|昨天|月底|月初|\d+月|\d{1,2}日|Q[1-4])$/.test(key)) raw.delete(key);
  }

  const all = [...raw.entries()];
  const strong = all.filter(([, c]) => c >= 2);
  const pool = strong.length >= 3 ? strong : all.filter(([t, c]) => c >= 2 || t.length >= 6);

  // 包含关系去重：短词被「出现次数不低于它」的长词吸收
  const kept = pool.filter(([term, c]) =>
    !pool.some(([other, oc]) => other !== term && other.length > term.length && other.includes(term) && oc >= c - 1)
  );

  const score = (term, c) => c * (1 + 0.55 * (term.length - 2));
  kept.sort((a, b) => score(b[0], b[1]) - score(a[0], a[1]));

  return kept.slice(0, 8).map(([term, c]) => ({ zh: '', en: '', term, count: c }));
}

/* ── 行动项 ─────────────────────────────────── */

function findDue(s) {
  for (const re of DUE_RE) {
    const m = s.match(re);
    if (m) return (m[1] || m[0]).trim();
  }
  return '';
}

function findOwner(s, speaker) {
  for (const re of ZH_OWNER) {
    const m = s.match(re);
    if (m && m[1] && m[1].length <= 8) return m[1].trim();
  }
  for (const re of EN_OWNER) {
    const m = s.match(re);
    if (m && m[1]) return m[1].trim();
  }
  if (speaker && (SELF_OWNER.test(s) || ZH_ACTION.test(s))) return speaker;
  return '';
}

function isAction(s, due) {
  if (STATUS_ONLY.test(s) && !due && !/[A-Za-z]/.test(s)) return false;
  if (ZH_ACTION.test(s) || EN_ACTION.test(s)) return true;
  if (due && ACTION_SOFT.test(s)) return true;
  if (/\b(will|going to|plan to|need to)\b/i.test(s)) return true;
  return false;
}

/* ── 主函数 ─────────────────────────────────── */

export function summarizeOffline(raw, meta = {}) {
  const text = String(raw || '').trim();
  const header = readHeader(text);
  const segs = parseSegments(text, header.skip);
  const lang = detectLang(text);
  const title = (meta.title || header.title || '').trim();
  const attendees = (meta.attendees || header.attendees || '').trim();

  // 说话人 + 参会名单 → 关键词黑名单（避免把人名当议题）
  const speakers = [...new Set(segs.map(s => s.speaker).filter(Boolean))];
  const attendeeNames = attendees
    .split(/[,，、;；\s]+/).map(s => s.trim()).filter(Boolean);

  const blacklist = new Set([...speakers, ...attendeeNames]);
  // 姓名中的单字组合也屏蔽
  for (const n of [...blacklist]) if (n.length >= 2) blacklist.add(n.slice(0, 2));

  const items = segs.map((seg, i) => ({
    i,
    s: seg.text,
    speaker: seg.speaker,
    score: scoreSentence(seg.text),
  }));

  const scored = [...items].sort((a, b) => b.score - a.score);
  const used = new Set();

  function take(pred, limit, simTh = 0.55) {
    const pool = scored.filter(x => !used.has(x.i) && pred(x));
    const kept = uniqBySim(pool.slice(0, limit * 4), x => x.s, simTh)
      .slice(0, limit)
      .sort((a, b) => a.i - b.i);
    kept.forEach(x => used.add(x.i));
    return kept;
  }

  // 具体类别先认领句子，剩余的高分句才进行动项，避免同一句四处出现
  const decisionLines = take(s => ZH_DECIDE.test(s.s) || EN_DECIDE.test(s.s), 6);
  const riskLines = take(s => ZH_RISK.test(s.s) || EN_RISK.test(s.s), 5);
  const nextLines = take(s => ZH_NEXT.test(s.s) || EN_NEXT.test(s.s), 5);
  const actionLines = take(x => {
    const due = findDue(x.s);
    return isAction(x.s, due) && (findOwner(x.s, x.speaker) || due || ACTION_SOFT.test(x.s));
  }, 8, 0.5);

  const summaryPicks = uniqBySim(
    scored.filter(x => x.score > 0.8).slice(0, 12),
    x => x.s
  ).slice(0, 6).sort((a, b) => a.i - b.i);

  const toBi = (x) => (lang === 'en' ? { zh: '', en: x.s } : { zh: x.s, en: '' });

  const actions = actionLines.map(x => ({
    owner: findOwner(x.s, x.speaker),
    due: findDue(x.s),
    ...toBi(x),
  }));

  return {
    engine: 'local',
    lang,
    updatedAt: new Date().toISOString(),
    meta: {
      title,
      attendees: attendees || speakers.join(', '),
      date: meta.date || new Date().toISOString().slice(0, 10),
      duration: meta.duration || '',
    },
    title: { zh: lang === 'en' ? '' : title, en: lang === 'en' ? title : '' },
    summary: summaryPicks.map(toBi),
    topics: extractTopics(items.map(x => x.s), blacklist),
    decisions: decisionLines.map(toBi),
    actions,
    risks: riskLines.map(toBi),
    next: nextLines.map(toBi),
    stats: {
      chars: text.length,
      sentences: items.length,
      words: (text.match(/[A-Za-z]+/g) || []).length + (text.match(/[\u4e00-\u9fff]/g) || []).length,
    },
  };
}

/** 把 AI 返回的 JSON 归一化成统一的模型 */
export function normalizeAIModel(data, raw, meta = {}) {
  const bi = (o) => ({ zh: String(o?.zh || '').trim(), en: String(o?.en || '').trim() });
  const arr = (v) => (Array.isArray(v) ? v : []).map(bi).filter(o => o.zh || o.en);

  const text = String(raw || '');
  return {
    engine: 'ai',
    lang: detectLang(text),
    updatedAt: new Date().toISOString(),
    meta: {
      title: meta.title || String(data?.title_zh || data?.title_en || ''),
      attendees: meta.attendees || '',
      date: meta.date || new Date().toISOString().slice(0, 10),
      duration: meta.duration || '',
    },
    title: { zh: String(data?.title_zh || '').trim(), en: String(data?.title_en || '').trim() },
    summary: [
      data?.summary_zh || data?.summary_en
        ? { zh: String(data?.summary_zh || '').trim(), en: String(data?.summary_en || '').trim() }
        : null,
    ].filter(Boolean),
    topics: arr(data?.topics).map(t => ({ ...t, term: t.zh || t.en, count: 0 })),
    decisions: arr(data?.decisions),
    actions: (Array.isArray(data?.actions) ? data.actions : []).map(a => ({
      owner: String(a?.owner || '').trim(),
      due: String(a?.due || '').trim(),
      zh: String(a?.zh || '').trim(),
      en: String(a?.en || '').trim(),
    })).filter(a => a.zh || a.en),
    risks: arr(data?.risks),
    next: arr(data?.next),
    stats: {
      chars: text.length,
      sentences: parseSegments(text).length,
      words: (text.match(/[A-Za-z]+/g) || []).length + (text.match(/[\u4e00-\u9fff]/g) || []).length,
    },
  };
}
