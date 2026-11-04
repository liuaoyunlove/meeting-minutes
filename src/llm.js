/**
 * AI 双语纪要（OpenAI 兼容接口，浏览器直连）
 * 默认 DeepSeek：https://api.deepseek.com/chat/completions  ·  deepseek-chat
 */

const SYSTEM_PROMPT = `你是一名资深会议秘书，负责把会议记录整理成专业、准确的双语会议纪要（English + 中文）。

严格输出一个 JSON 对象（不要 markdown 代码块，不要任何解释文字），字段如下：
{
  "title_zh": "会议主题（中文，简洁）",
  "title_en": "Meeting title in English",
  "summary_zh": "3-5 句中文摘要，覆盖背景、结论、影响",
  "summary_en": "3-5 sentences English summary, faithful paraphrase",
  "topics":  [{"zh": "议题", "en": "Topic"}],
  "decisions": [{"zh": "决议", "en": "Decision"}],
  "actions": [{"owner": "负责人或空串", "due": "截止时间或空串", "zh": "任务", "en": "Task"}],
  "risks": [{"zh": "风险/问题", "en": "Risk / issue"}],
  "next": [{"zh": "下一步", "en": "Next step"}]
}

要求：
1. 中文与英文必须语义一致，是同一份纪要的两个语言版本，英文要地道，不要逐字直译。
2. 只写会议记录里真实出现过的信息，不要编造人名、日期、数字；信息缺失就省略该条目，不要写“未提及”。
3. decisions / actions / risks / next 各 0-8 条，没有就给空数组。
4. 行动项尽量填写 owner 与 due；原文没写就留空字符串。`;

function trimTranscript(text, max = 14000) {
  const t = String(text || '');
  if (t.length <= max) return t;
  const head = Math.floor(max * 0.6);
  const tail = max - head;
  return `${t.slice(0, head)}\n\n…（中间内容过长已省略）…\n\n${t.slice(-tail)}`;
}

function parseJSON(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

export async function generateWithAI({ raw, meta, cfg }) {
  const endpoint = (cfg.base || 'https://api.deepseek.com/chat/completions').trim();
  const model = (cfg.model || 'deepseek-chat').trim();
  const key = (cfg.key || '').trim();

  if (!key) throw new Error('请先在「设置」里填写 API Key，或切换到本地提取。');

  const context = [
    meta.title ? `会议主题 / Title: ${meta.title}` : '',
    meta.attendees ? `参会人 / Attendees: ${meta.attendees}` : '',
    meta.date ? `日期 / Date: ${meta.date}` : '',
  ].filter(Boolean).join('\n');

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 2600,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `${context ? context + '\n\n' : ''}以下是会议记录 / Meeting notes:\n\n${trimTranscript(raw)}` },
        ],
      }),
    });
  } catch (err) {
    throw new Error(`请求失败：${err.message}。若为跨域（CORS）限制，请改用本地提取，或在支持 CORS 的网关上代理该接口。`);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error?.message || j?.message || '';
    } catch { /* ignore */ }
    throw new Error(`接口返回 ${res.status}${detail ? '：' + detail : ''}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('接口没有返回内容，请检查模型名是否可用。');

  let parsed;
  try {
    parsed = parseJSON(content);
  } catch {
    throw new Error('AI 返回的不是合法 JSON，请重试一次。');
  }
  return parsed;
}
