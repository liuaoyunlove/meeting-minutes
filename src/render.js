/** 纪要渲染：把模型对象渲染成双语 / 单语 HTML */

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** 按视图挑选文本；缺失时回退到另一种语言 */
function pick(item, view) {
  const zh = item?.zh || '';
  const en = item?.en || '';
  if (view === 'zh') return zh || en;
  if (view === 'en') return en || zh;
  return null;
}

function biBlock(item, view, strong = false) {
  if (!item) return '';
  const single = pick(item, view);
  if (single !== null) {
    return `<li${strong ? ' class="is-strong"' : ''}>${esc(single)}</li>`;
  }
  const zh = item.zh ? `<div class="bi__zh">${esc(item.zh)}</div>` : '';
  const en = item.en ? `<div class="bi__en">${esc(item.en)}</div>` : '';
  return `<li${strong ? ' class="is-strong"' : ''}><div class="bi">${zh}${en}</div></li>`;
}

function list(items, view, { strong = false } = {}) {
  if (!items?.length) return '';
  return `<ul class="min-list">${items.map(i => biBlock(i, view, strong)).join('')}</ul>`;
}

function section(zhLabel, enLabel, inner) {
  if (!inner) return '';
  return `<section class="min-sec">
    <h2 class="min-sec__title">${esc(zhLabel)} <span>${esc(enLabel)}</span></h2>
    ${inner}
  </section>`;
}

function dateLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function renderMinutes(model, view = 'bi') {
  if (!model) return '';

  const titleZh = model.title?.zh || model.meta?.title || '';
  const titleEn = model.title?.en || '';
  const heading = view === 'en' ? (titleEn || titleZh) : (titleZh || titleEn) || '会议纪要';
  const sub = view === 'bi' && titleZh && titleEn ? titleEn : '';

  const metaBits = [];
  if (model.meta?.date) metaBits.push(`<span><b>日期 / Date</b> ${esc(dateLabel(model.meta.date))}</span>`);
  if (model.meta?.duration) metaBits.push(`<span><b>时长 / Duration</b> ${esc(model.meta.duration)}</span>`);
  if (model.meta?.attendees) metaBits.push(`<span><b>参会 / Attendees</b> ${esc(model.meta.attendees)}</span>`);
  if (model.stats?.chars) metaBits.push(`<span><b>篇幅 / Length</b> ${model.stats.chars.toLocaleString()} 字符</span>`);

  const head = `<header class="min-head">
    <h1>${esc(heading)}</h1>
    ${sub ? `<p class="min-en">${esc(sub)}</p>` : ''}
    <div class="min-meta">${metaBits.join('')}</div>
  </header>`;

  // 摘要
  let summaryHTML = '';
  if (model.summary?.length) {
    const one = model.summary.length === 1;
    if (one) {
      const it = model.summary[0];
      const single = pick(it, view);
      const inner = single !== null
        ? esc(single)
        : `${it.zh ? `<p>${esc(it.zh)}</p>` : ''}${it.en ? `<p class="bi__en">${esc(it.en)}</p>` : ''}`;
      summaryHTML = `<div class="min-quote">${inner}</div>`;
    } else {
      summaryHTML = list(model.summary, view);
    }
  }

  // 议题
  let topicsHTML = '';
  if (model.topics?.length) {
    const chips = model.topics.map(t => {
      const single = pick(t, view);
      if (single !== null) return `<span class="chip">${esc(single)}</span>`;
      const label = [t.zh, t.en].filter(Boolean).join(' · ') || t.term || '';
      return `<span class="chip">${esc(label)}</span>`;
    }).join('');
    topicsHTML = `<div class="chips">${chips}</div>`;
  }

  // 行动项
  let actionsHTML = '';
  if (model.actions?.length) {
    const ownerH = view === 'en' ? 'Owner' : view === 'zh' ? '负责人' : '负责人 / Owner';
    const taskH = view === 'en' ? 'Task' : view === 'zh' ? '事项' : '事项 / Task';
    const dueH = view === 'en' ? 'Due' : view === 'zh' ? '截止' : '截止 / Due';

    const rows = model.actions.map(a => {
      const single = pick(a, view);
      const task = single !== null
        ? esc(single)
        : `<div class="bi">${a.zh ? `<div class="bi__zh">${esc(a.zh)}</div>` : ''}${a.en ? `<div class="bi__en">${esc(a.en)}</div>` : ''}</div>`;
      return `<tr>
        <td>${esc(a.owner) || '—'}</td>
        <td>${task}</td>
        <td class="due">${esc(a.due) || '—'}</td>
      </tr>`;
    }).join('');

    actionsHTML = `<table class="min-table">
      <thead><tr><th>${esc(ownerH)}</th><th>${esc(taskH)}</th><th>${esc(dueH)}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  const body = [
    section('会议摘要', 'Summary', summaryHTML),
    section('关键议题', 'Key Topics', topicsHTML),
    section('行动项', 'Action Items', actionsHTML),
    section('决议', 'Decisions', list(model.decisions, view, { strong: true })),
    section('风险与问题', 'Risks & Issues', list(model.risks, view)),
    section('下一步', 'Next Steps', list(model.next, view)),
  ].join('');

  const engineLabel = model.engine === 'ai' ? 'AI 双语' : '本地提取';
  const stamp = `<div class="stamp">
    <span>生成于 ${esc(new Date(model.updatedAt || Date.now()).toLocaleString('zh-CN', { hour12: false }))} · ${esc(engineLabel)}</span>
    <span>会议纪要 · Meeting Minutes</span>
  </div>`;

  const hasAny = summaryHTML || topicsHTML || actionsHTML || model.decisions?.length || model.risks?.length || model.next?.length;
  if (!hasAny) {
    return `<header class="min-head"><h1>${esc(heading)}</h1></header>
      <p class="hint">记录太短，没能提取出可用信息。再补充几句会议内容后重新生成。</p>`;
  }

  return head + body + stamp;
}
