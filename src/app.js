/** 应用装配：录音 → 转写 → 摘要 → 渲染 → 导出 */

import { summarizeOffline, normalizeAIModel } from './summarizer.js';
import { createRecorder, speechSupported } from './recorder.js';
import { generateWithAI } from './llm.js';
import { renderMinutes } from './render.js';
import { exportMarkdown, exportText, exportJSON, exportPDF } from './exporter.js';

const $ = (sel) => document.querySelector(sel);

const el = {
  badge:        $('#engineBadge'),
  btnSettings:  $('#btnSettings'),
  btnGenerate:  $('#btnGenerate'),
  exportMenu:   $('#exportMenu'),
  langSel:      $('#langSel'),
  timer:        $('#timer'),
  btnMic:       $('#btnMic'),
  transcript:   $('#transcript'),
  interim:      $('#interim'),
  charCount:    $('#charCount'),
  btnImport:    $('#btnImport'),
  fileInput:    $('#fileInput'),
  btnDemo:      $('#btnDemo'),
  btnClear:     $('#btnClear'),
  minutes:      $('#minutes'),
  emptyState:   $('#emptyState'),
  viewSeg:      $('#viewSeg'),
  dlg:          $('#dlgSettings'),
  engineSel:    $('#engineSel'),
  aiFields:     $('#aiFields'),
  apiBase:      $('#apiBase'),
  apiModel:     $('#apiModel'),
  apiKey:       $('#apiKey'),
  metaTitle:    $('#metaTitle'),
  metaAttendees:$('#metaAttendees'),
  toast:        $('#toast'),
};

const LS = { settings: 'mm.settings.v1', transcript: 'mm.transcript.v1', minutes: 'mm.minutes.v1' };

const DEFAULT_SETTINGS = {
  engine: 'local',
  base: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-chat',
  key: '',
  title: '',
  attendees: '',
};

const state = {
  settings: { ...DEFAULT_SETTINGS },
  model: null,
  view: 'bi',
  seconds: 0,
  busy: false,
};

/* ── 工具 ───────────────────────────────────── */

let toastTimer;
function toast(msg, ms = 2600) {
  el.toast.textContent = msg;
  el.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-on'), ms);
}

const loadJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 配额满 */ } };

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateCharCount() {
  const t = el.transcript.value;
  const n = t.replace(/\s/g, '').length;
  el.charCount.textContent = `${n.toLocaleString()} 字`;
}

/* ── 录音 ───────────────────────────────────── */

let recTimer = null;
const recorder = createRecorder({
  lang: 'zh-CN',
  onFinal(text) {
    const cur = el.transcript.value;
    const sep = !cur ? '' : /[\n]$/.test(cur) ? '' : (cur.endsWith('。') || /[.!?]$/.test(cur) ? ' ' : ' ');
    el.transcript.value = cur + sep + text;
    el.transcript.scrollTop = el.transcript.scrollHeight;
    updateCharCount();
    scheduleSaveTranscript();
  },
  onInterim(text) {
    el.interim.textContent = text ? `… ${text}` : '';
  },
  onStateChange(running) {
    el.btnMic.classList.toggle('is-recording', running);
    el.btnMic.querySelector('span').textContent = running ? '停止录音' : '开始录音';
    el.timer.classList.toggle('is-live', running);
    if (running) {
      clearInterval(recTimer);
      recTimer = setInterval(() => { state.seconds++; el.timer.textContent = fmtTime(state.seconds); }, 1000);
    } else {
      clearInterval(recTimer);
      el.interim.textContent = '';
    }
  },
  onError(msg) { toast(msg, 4200); },
});

function mapLang(v) {
  if (v === 'en-US') return 'en-US';
  return 'zh-CN'; // 「中英混合」使用中文识别器，仍能转写英文片段
}

el.btnMic.addEventListener('click', () => {
  if (!speechSupported) {
    toast('当前浏览器不支持语音识别，请用 Chrome / Edge，或直接粘贴会议文字。', 4200);
    return;
  }
  if (recorder.running) {
    recorder.stop();
  } else {
    state.seconds = 0;
    el.timer.textContent = '00:00';
    recorder.start();
    if (el.langSel.value === 'mixed') toast('中英混合模式：以中文识别为主，英文词可手动修正。');
  }
});

el.langSel.addEventListener('change', () => {
  recorder.setLang(mapLang(el.langSel.value));
});

/* ── 转写持久化 ─────────────────────────────── */

let saveTimer;
function scheduleSaveTranscript() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveJSON(LS.transcript, el.transcript.value), 400);
}

el.transcript.addEventListener('input', () => {
  updateCharCount();
  scheduleSaveTranscript();
});

/* ── 生成 ───────────────────────────────────── */

function currentMeta() {
  return {
    title: state.settings.title?.trim() || '',
    attendees: state.settings.attendees?.trim() || '',
    duration: state.seconds ? fmtTime(state.seconds) : '',
    date: new Date().toISOString().slice(0, 10),
  };
}

async function generate() {
  if (state.busy) return;
  const raw = el.transcript.value.trim();
  if (raw.length < 20) {
    toast('会议内容太短，至少 20 个字再生成。');
    el.transcript.focus();
    return;
  }

  state.busy = true;
  el.btnGenerate.disabled = true;
  el.btnGenerate.textContent = '生成中…';

  const meta = currentMeta();
  let model = null;

  try {
    if (state.settings.engine === 'ai') {
      try {
        const data = await generateWithAI({ raw, meta, cfg: state.settings });
        model = normalizeAIModel(data, raw, meta);
      } catch (err) {
        toast(`${err.message} —— 已回退到本地提取。`, 5200);
        model = summarizeOffline(raw, meta);
      }
    } else {
      model = summarizeOffline(raw, meta);
    }

    state.model = model;
    render();
    saveJSON(LS.minutes, model);
    toast(model.engine === 'ai' ? 'AI 双语纪要已生成' : '本地纪要已生成，可点开编辑');
  } catch (err) {
    console.error(err);
    toast(`生成失败：${err.message}`, 5000);
  } finally {
    state.busy = false;
    el.btnGenerate.disabled = false;
    el.btnGenerate.textContent = '生成纪要';
  }
}

function render() {
  if (!state.model) {
    el.minutes.innerHTML = '';
    el.minutes.hidden = true;
    el.emptyState.hidden = false;
    return;
  }
  el.emptyState.hidden = true;
  el.minutes.hidden = false;
  el.minutes.innerHTML = renderMinutes(state.model, state.view);
  el.minutes.contentEditable = 'true';
  el.minutes.setAttribute('spellcheck', 'false');
}

el.btnGenerate.addEventListener('click', generate);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    generate();
  }
});

/* ── 视图切换 ───────────────────────────────── */

el.viewSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg__btn');
  if (!btn) return;
  el.viewSeg.querySelectorAll('.seg__btn').forEach(b => b.classList.toggle('is-active', b === btn));
  state.view = btn.dataset.view;
  render();
});

/* ── 导入 / 示例 / 清空 ─────────────────────── */

function stripSubtitles(text) {
  return text
    .split(/\r?\n/)
    .filter(line => !/^\d+$/.test(line.trim()))
    .filter(line => !/^\d{1,2}:\d{2}(:\d{2})?[.,]?\d*\s*-->/.test(line.trim()))
    .filter(line => !/^WEBVTT/i.test(line.trim()))
    .filter(line => !/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(line.trim()))
    .join('\n');
}

el.btnImport.addEventListener('click', () => el.fileInput.click());

el.fileInput.addEventListener('change', async () => {
  const file = el.fileInput.files?.[0];
  if (!file) return;
  try {
    let text = await file.text();
    if (/\.(vtt|srt)$/i.test(file.name)) text = stripSubtitles(text);
    if (/\.json$/i.test(file.name)) {
      try {
        const j = JSON.parse(text);
        text = j.transcript || j.text || text;
      } catch { /* 保留原文 */ }
    }
    el.transcript.value = [el.transcript.value, text].filter(Boolean).join('\n');
    updateCharCount();
    scheduleSaveTranscript();
    toast(`已导入 ${file.name}`);
  } catch (err) {
    toast(`导入失败：${err.message}`);
  } finally {
    el.fileInput.value = '';
  }
});

const DEMO = `产品周会 · 双十一活动准备
参会：张伟、李娜、王强、John、陈晨

张伟：先同步上周进度，登录模块已经上线，灰度 10%，没有发现阻断性问题。
李娜：支付回调这块还有问题，第三方沙箱昨天挂了两次，导致测试没跑完。
王强：我们决定把支付回归测试挪到下周二，优先保证双十一活动页上线。
张伟：同意，活动页必须本周五前完成联调，王强负责。
王强：明白，我今晚把联调环境搭好，周五中午出结果。
John：We agreed to freeze the feature scope on Nov 8. Any new request goes to backlog.
李娜：风险是第三方支付沙箱不稳定，如果下周一还没恢复，就切到本地 mock。
陈晨：文档方面，我负责在周五前更新 API 文档并同步给客服团队。
张伟：下一步，下周例会评审双十一活动的压测方案，顺便确认埋点需求。`;

el.btnDemo.addEventListener('click', () => {
  el.transcript.value = DEMO;
  updateCharCount();
  scheduleSaveTranscript();
  toast('已载入示例，点「生成纪要」看效果');
});

el.btnClear.addEventListener('click', () => {
  if (!el.transcript.value.trim()) return;
  if (!confirm('清空所有会议记录和生成的纪要？')) return;
  el.transcript.value = '';
  state.model = null;
  state.seconds = 0;
  el.timer.textContent = '00:00';
  updateCharCount();
  localStorage.removeItem(LS.transcript);
  localStorage.removeItem(LS.minutes);
  render();
  toast('已清空');
});

/* ── 导出 ───────────────────────────────────── */

el.exportMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-export]');
  if (!btn) return;
  el.exportMenu.open = false;

  if (!state.model) { toast('先生成纪要再导出。'); return; }
  // 以页面上编辑后的内容为准：若用户改过 DOM，先提示（导出仍取模型数据）
  const kind = btn.dataset.export;
  try {
    if (kind === 'print') exportPDF(state.model);
    else if (kind === 'md') { exportMarkdown(state.model); toast('已导出 Markdown'); }
    else if (kind === 'json') { exportJSON(state.model, el.transcript.value); toast('已导出 JSON'); }
    else if (kind === 'txt') { exportText(state.model); toast('已导出 TXT'); }
  } catch (err) {
    toast(`导出失败：${err.message}`);
  }
});

document.addEventListener('click', (e) => {
  if (el.exportMenu.open && !el.exportMenu.contains(e.target)) el.exportMenu.open = false;
});

/* ── 设置 ───────────────────────────────────── */

function syncEngineBadge() {
  const ai = state.settings.engine === 'ai';
  el.badge.textContent = ai ? 'AI 双语' : '本地提取';
  el.badge.dataset.tone = ai ? 'ai' : 'local';
}

function fillSettingsForm() {
  const s = state.settings;
  el.engineSel.value = s.engine;
  el.apiBase.value = s.base;
  el.apiModel.value = s.model;
  el.apiKey.value = s.key;
  el.metaTitle.value = s.title;
  el.metaAttendees.value = s.attendees;
  el.aiFields.hidden = s.engine !== 'ai';
}

el.btnSettings.addEventListener('click', () => {
  fillSettingsForm();
  el.dlg.showModal();
});

el.engineSel.addEventListener('change', () => {
  el.aiFields.hidden = el.engineSel.value !== 'ai';
});

el.dlg.addEventListener('close', () => {
  if (el.dlg.returnValue !== 'save') return;
  state.settings = {
    engine: el.engineSel.value,
    base: el.apiBase.value.trim() || DEFAULT_SETTINGS.base,
    model: el.apiModel.value.trim() || DEFAULT_SETTINGS.model,
    key: el.apiKey.value.trim(),
    title: el.metaTitle.value.trim(),
    attendees: el.metaAttendees.value.trim(),
  };
  saveJSON(LS.settings, state.settings);
  syncEngineBadge();
  if (state.model) render();
  toast('设置已保存');
});

/* ── 初始化 ─────────────────────────────────── */

function init() {
  const savedSettings = loadJSON(LS.settings);
  if (savedSettings) state.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
  syncEngineBadge();

  const savedText = localStorage.getItem(LS.transcript);
  if (savedText) el.transcript.value = savedText;

  const savedModel = loadJSON(LS.minutes);
  if (savedModel) state.model = savedModel;

  updateCharCount();
  render();

  if (!speechSupported) {
    el.btnMic.disabled = true;
    el.btnMic.title = '浏览器不支持语音识别';
    el.btnMic.querySelector('span').textContent = '不支持识别';
  }

  // 首次访问：载入示例，避免空白页
  if (!savedText && !savedModel) {
    el.transcript.value = DEMO;
    updateCharCount();
  }

  // 演示链接：?demo=1 直接用示例跑一遍完整流程
  if (new URLSearchParams(location.search).has('demo')) {
    el.transcript.value = DEMO;
    updateCharCount();
    setTimeout(generate, 80);
  }
}

init();
