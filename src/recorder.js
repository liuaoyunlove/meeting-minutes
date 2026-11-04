/**
 * 实时语音转写（Web Speech API）
 * 仅 Chrome / Edge 等 Chromium 内核支持；需要 HTTPS 或 localhost。
 */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const speechSupported = Boolean(SR);

export function createRecorder({ onFinal, onInterim, onStateChange, onError, lang = 'zh-CN' }) {
  if (!SR) {
    return {
      start() { onError?.('当前浏览器不支持语音识别，请使用 Chrome / Edge，或直接粘贴会议文字。'); },
      stop() {},
      get running() { return false; },
      supported: false,
    };
  }

  let recognition = null;
  let running = false;
  let restartTimer = null;
  let lastErrorAt = 0;

  function build() {
    const r = new SR();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => onStateChange?.(true);

    r.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const chunk = res[0]?.transcript ?? '';
        if (res.isFinal) {
          const text = chunk.trim();
          if (text) onFinal?.(text);
        } else {
          interim += chunk;
        }
      }
      onInterim?.(interim.trim());
    };

    r.onerror = (event) => {
      const code = event.error;
      if (code === 'no-speech' || code === 'aborted') return;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        running = false;
        onStateChange?.(false);
        onError?.('麦克风权限被拒绝。请在地址栏允许麦克风后重试，或直接粘贴会议文字。');
        return;
      }
      // network / audio-capture 等，节流后自动重连
      const now = Date.now();
      if (now - lastErrorAt > 4000) {
        lastErrorAt = now;
        onError?.(`识别中断（${code}），正在自动重连…`);
      }
    };

    r.onend = () => {
      onInterim?.('');
      if (!running) {
        onStateChange?.(false);
        return;
      }
      // 连续模式下浏览器会自行结束，稍后重启
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        if (!running) return;
        try { r.start(); } catch { /* 已在运行 */ }
      }, 320);
    };

    return r;
  }

  return {
    supported: true,
    get running() { return running; },

    setLang(next) {
      lang = next;
      if (running) { this.stop(); this.start(); }
    },

    start() {
      if (running) return;
      running = true;
      recognition = build();
      try {
        recognition.start();
        onStateChange?.(true);
      } catch (err) {
        running = false;
        onStateChange?.(false);
        onError?.(`无法启动录音：${err.message}`);
      }
    },

    stop() {
      running = false;
      clearTimeout(restartTimer);
      try { recognition?.stop(); } catch { /* noop */ }
      recognition = null;
      onInterim?.('');
      onStateChange?.(false);
    },
  };
}
