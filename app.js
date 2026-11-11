(() => {
  const $ = id => document.getElementById(id);
  const inputView = $('input-view'), readerView = $('reader-view');
  const textEl = $('text'), wpmEl = $('wpm'), wpmOut = $('wpm-out');
  const wordEl = $('word'), mainBtn = $('main-btn'), options = $('options');
  const bar = $('bar'), status = $('status'), wpmLabel = $('wpm-label');

  let words = [], idx = 0, wpm = 300, fs = 56, timer = null;
  let state = 'ready'; // ready | reading | paused | done

  try {
    textEl.value = localStorage.getItem('sr-text') || '';
    wpmEl.value = localStorage.getItem('sr-wpm') || 300;
    fs = +localStorage.getItem('sr-fs') || 56;
  } catch (_) {}
  wpmOut.textContent = wpmEl.value;
  wpmEl.oninput = () => (wpmOut.textContent = wpmEl.value);

  const save = () => { try { localStorage.setItem('sr-text', textEl.value); localStorage.setItem('sr-wpm', wpm); localStorage.setItem('sr-fs', fs); } catch (_) {} };

  function applyFont() { document.documentElement.style.setProperty('--fs', fs + 'px'); }

  function show(i) {
    const w = words[i] || '';
    const chars = [...w];
    const mid = Math.floor((chars.length - 1) / 2);
    const [l, m, r] = wordEl.children;
    l.textContent = chars.slice(0, mid).join('');
    m.textContent = chars[mid] || '';
    r.textContent = chars.slice(mid + 1).join('');
    bar.style.width = words.length ? ((i + 1) / words.length * 100) + '%' : '0';
    status.textContent = words.length ? `${i + 1} / ${words.length} · ${wpm} wpm` : '';
    wpmLabel.textContent = wpm;
  }

  function delayFor(w) {
    let d = 60000 / wpm;
    if (/[.!?]$/.test(w)) d *= 1.5; else if (/[,;:]$/.test(w)) d *= 1.2;
    return d;
  }

  function tick() {
    show(idx);
    const w = words[idx];
    idx++;
    timer = setTimeout(() => {
      if (idx >= words.length) return finish();
      tick();
    }, delayFor(w));
  }

  function finish() {
    clearTimeout(timer);
    idx = words.length - 1;
    state = 'done';
    render();
  }

  function render() {
    options.hidden = state === 'reading' || state === 'ready';
    mainBtn.textContent = { ready: 'Start', reading: 'Pause', paused: 'Resume', done: 'Restart' }[state];
    $('back10').disabled = state === 'done' ? false : idx <= 0;
  }

  function begin() { state = 'reading'; render(); tick(); }

  mainBtn.onclick = () => {
    if (state === 'ready') { begin(); }
    else if (state === 'reading') { clearTimeout(timer); state = 'paused'; idx = Math.max(idx - 1, 0); show(idx); render(); }
    else if (state === 'paused') { begin(); }
    else if (state === 'done') { idx = 0; begin(); }
  };

  $('back10').onclick = () => {
    if (state === 'done') state = 'paused';
    idx = Math.max(idx - 10, 0); show(idx); render();
  };
  const setFont = d => { fs = Math.min(200, Math.max(16, fs + d)); applyFont(); save(); };
  $('font-up').onclick = () => setFont(6);
  $('font-down').onclick = () => setFont(-6);
  const setWpm = d => { wpm = Math.min(1500, Math.max(50, wpm + d)); wpmEl.value = wpm; wpmOut.textContent = wpm; show(Math.min(idx, words.length - 1)); save(); };
  $('wpm-up').onclick = () => setWpm(25);
  $('wpm-down').onclick = () => setWpm(-25);

  $('back-input').onclick = () => {
    clearTimeout(timer); state = 'ready';
    readerView.hidden = true; inputView.hidden = false;
  };

  $('submit').onclick = () => {
    words = textEl.value.split(/\s+/).filter(Boolean);
    if (!words.length) { textEl.focus(); return; }
    wpm = +wpmEl.value; idx = 0; state = 'ready'; save(); applyFont();
    inputView.hidden = true; readerView.hidden = false;
    show(0); status.textContent = `${words.length} words · ${wpm} wpm`; render();
  };

  document.addEventListener('keydown', e => {
    if (readerView.hidden || e.target.tagName === 'BUTTON' && e.key === ' ') return;
    if (e.key === ' ') { e.preventDefault(); mainBtn.click(); }
  });

  applyFont();

  // ---- PWA: service worker + update prompt on every open ----
  if ('serviceWorker' in navigator) {
    const banner = $('update-banner');
    let reloading = false, wantUpdate = false;
    const promptUpdate = reg => {
      banner.hidden = false;
      $('update-yes').onclick = () => { wantUpdate = true; reg.waiting && reg.waiting.postMessage('SKIP_WAITING'); };
      $('update-no').onclick = () => (banner.hidden = true);
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!wantUpdate || reloading) return; reloading = true; location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(reg => {
      const hadController = !!navigator.serviceWorker.controller;
      if (reg.waiting && hadController) promptUpdate(reg);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(reg);
        });
      });
      reg.update().catch(() => {}); // check for a new version on every open
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  }
})();
