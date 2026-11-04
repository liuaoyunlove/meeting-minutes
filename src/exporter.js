/** 导出：Markdown / 纯文本 / JSON / 打印(存 PDF) */

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function safeName(model) {
  const t = model?.title?.zh || model?.title?.en || model?.meta?.title || 'meeting-minutes';
  const clean = String(t).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 40);
  return `${clean || '会议纪要'}-${stamp()}`;
}

const biLine = (it) => {
  const parts = [it.zh, it.en].filter(Boolean);
  return parts.length ? parts.join(' / ') : (it.term || '');
};

export function toMarkdown(model) {
  if (!model) return '';
  const L = [];
  const titleZh = model.title?.zh || model.meta?.title || '';
  const titleEn = model.title?.en || '';

  L.push(`# ${titleZh || titleEn || '会议纪要'}`);
  if (titleEn && titleEn !== titleZh) L.push(`## ${titleEn}`, '');
  else L.push('');

  const meta = [];
  if (model.meta?.date) meta.push(`**日期 / Date:** ${model.meta.date}`);
  if (model.meta?.duration) meta.push(`**时长 / Duration:** ${model.meta.duration}`);
  if (model.meta?.attendees) meta.push(`**参会 / Attendees:** ${model.meta.attendees}`);
  if (meta.length) L.push(meta.join('  \n'), '');

  if (model.summary?.length) {
    L.push('## 会议摘要 / Summary', '');
    for (const s of model.summary) {
      if (s.zh) L.push(`- ${s.zh}`);
      if (s.en) L.push(`  - *${s.en}*`);
    }
    L.push('');
  }

  if (model.topics?.length) {
    L.push('## 关键议题 / Key Topics', '');
    L.push(model.topics.map(t => biLine(t)).filter(Boolean).join(' · '), '');
  }

  if (model.actions?.length) {
    L.push('## 行动项 / Action Items', '');
    L.push('| 负责人 Owner | 事项 Task | 截止 Due |');
    L.push('| --- | --- | --- |');
    for (const a of model.actions) {
      const task = [a.zh, a.en].filter(Boolean).join('<br>');
      L.push(`| ${a.owner || '—'} | ${task || '—'} | ${a.due || '—'} |`);
    }
    L.push('');
  }

  const blockList = (heading, items) => {
    if (!items?.length) return;
    L.push(`## ${heading}`, '');
    for (const it of items) {
      if (it.zh && it.en) L.push(`- ${it.zh}  \n  *${it.en}*`);
      else L.push(`- ${it.zh || it.en}`);
    }
    L.push('');
  };

  blockList('决议 / Decisions', model.decisions);
  blockList('风险与问题 / Risks & Issues', model.risks);
  blockList('下一步 / Next Steps', model.next);

  L.push('---');
  L.push(`*生成于 ${new Date(model.updatedAt || Date.now()).toLocaleString('zh-CN', { hour12: false })} · ${model.engine === 'ai' ? 'AI 双语' : '本地提取'} · 会议纪要 Meeting Minutes*`);
  return L.join('\n');
}

export function toText(model) {
  if (!model) return '';
  const L = [];
  const titleZh = model.title?.zh || model.meta?.title || '';
  const titleEn = model.title?.en || '';
  L.push(titleZh || titleEn || '会议纪要');
  if (titleEn && titleEn !== titleZh) L.push(titleEn);
  L.push('='.repeat(40));

  if (model.meta?.date) L.push(`日期: ${model.meta.date}`);
  if (model.meta?.attendees) L.push(`参会: ${model.meta.attendees}`);
  L.push('');

  if (model.summary?.length) {
    L.push('【会议摘要 Summary】');
    for (const s of model.summary) { if (s.zh) L.push(`- ${s.zh}`); if (s.en) L.push(`- ${s.en}`); }
    L.push('');
  }
  if (model.actions?.length) {
    L.push('【行动项 Action Items】');
    for (const a of model.actions) L.push(`- [${a.owner || '-'}] ${a.zh || a.en} (${a.due || '-'})`);
    L.push('');
  }
  for (const [h, items] of [
    ['【决议 Decisions】', model.decisions],
    ['【风险 Risks】', model.risks],
    ['【下一步 Next Steps】', model.next],
  ]) {
    if (!items?.length) continue;
    L.push(h);
    for (const it of items) L.push(`- ${it.zh || it.en}${it.en && it.zh ? ` / ${it.en}` : ''}`);
    L.push('');
  }
  return L.join('\n');
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportMarkdown(model) {
  download(`${safeName(model)}.md`, toMarkdown(model), 'text/markdown');
}

export function exportText(model) {
  download(`${safeName(model)}.txt`, toText(model), 'text/plain');
}

export function exportJSON(model, transcript) {
  download(`${safeName(model)}.json`, JSON.stringify({ model, transcript }, null, 2), 'application/json');
}

export function exportPDF(model) {
  const prev = document.title;
  const t = model?.title?.zh || model?.title?.en || '会议纪要';
  document.title = String(t).replace(/[\\/:*?"<>|]/g, '-');
  window.print();
  setTimeout(() => { document.title = prev; }, 1200);
}
