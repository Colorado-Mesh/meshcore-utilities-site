document.addEventListener('DOMContentLoaded', () => {
  const banner = document.getElementById('serial-support-banner');
  const status = document.getElementById('serial-status');
  const profileName = document.getElementById('serial-profile-name');
  const profileDesc = document.getElementById('serial-profile-description');
  const portSettings = document.getElementById('serial-port-settings');
  const connectBtn = document.getElementById('serial-connect-btn');
  const disconnectBtn = document.getElementById('serial-disconnect-btn');
  const clearLogBtn = document.getElementById('serial-clear-log-btn');
  const commandList = document.getElementById('serial-command-list');
  const logPanel = document.getElementById('serial-log');
  const state = { config: null, port: null, reader: null, busy: false, buttons: [] };
  const enc = new TextEncoder();

  const supportsSerial = () => typeof navigator !== 'undefined' && 'serial' in navigator;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const setBanner = (msg, err) => {
    if (!msg) { banner.style.display = 'none'; banner.textContent = ''; return; }
    banner.style.display = 'block'; banner.textContent = msg;
    banner.classList.toggle('serial-banner-error', !!err);
    banner.classList.toggle('serial-banner-info', !err);
  };
  const setStatus = (cls, text) => { status.className = `serial-status-pill serial-status-${cls}`; status.textContent = text; };
  const log = (msg, kind='') => {
    const row = document.createElement('div');
    row.className = `serial-log-line${kind ? ` serial-log-${kind}` : ''}`;
    row.innerHTML = `<span class="serial-log-time">[${new Date().toLocaleTimeString()}]</span> ${esc(msg).replace(/\r/g,'\\r').replace(/\n/g,'\\n')}`;
    logPanel.appendChild(row); logPanel.scrollTop = logPanel.scrollHeight;
  };
  const setBusy = busy => {
    state.busy = busy;
    connectBtn.disabled = !supportsSerial() || busy;
    disconnectBtn.disabled = !state.port || busy;
    state.buttons.forEach(btn => { btn.disabled = !supportsSerial() || busy || !state.config; });
  };
  const normEnding = (v, fallback) => {
    if (typeof v !== 'string' || !v.trim()) return fallback;
    const n = v.trim().toUpperCase();
    if (n === 'CRLF') return '\r\n'; if (n === 'CR') return '\r'; if (n === 'LF') return '\n'; if (n === 'NONE') return '';
    return v;
  };
  const delay = ms => new Promise(r => setTimeout(r, Math.max(0, Number(ms) || 0)));
  const steps = action => Array.isArray(action.steps) && action.steps.length ? action.steps : (typeof action.command === 'string' && action.command.trim() ? [{ type: 'send', command: action.command, lineEnding: action.lineEnding, delayMs: action.delayMs }] : []);
  const payload = (step, action) => `${String(step.command ?? '').replaceAll('{profileName}', state.config?.name || '').replaceAll('{commandLabel}', action.label || '').replaceAll('{commandId}', action.id || '')}${normEnding(step.lineEnding, normEnding(state.config?.serial?.defaultLineEnding, '\r\n'))}`;

  async function write(text) {
    if (!state.port?.writable) throw new Error('No serial port is open.');
    const writer = state.port.writable.getWriter();
    try { await writer.write(enc.encode(text)); } finally { writer.releaseLock(); }
  }

  function readLoop() {
    if (!state.port?.readable || state.reader) return;
    const decoder = new TextDecoderStream();
    state.port.readable.pipeTo(decoder.writable).catch(() => {});
    state.reader = decoder.readable.getReader();
    (async () => {
      try {
        while (true) {
          const { value, done } = await state.reader.read();
          if (done) break;
          if (value) log(value, 'incoming');
        }
      } catch (e) {
        if (state.port) log(e.message || 'Serial read error.', 'error');
      } finally {
        state.reader = null;
      }
    })();
  }

  async function connect(keepBusy=false) {
    if (!supportsSerial()) throw new Error('Web Serial is not supported in this browser.');
    if (state.port) return state.port;
    const serial = state.config?.serial || {};
    const options = Array.isArray(serial.filters) && serial.filters.length ? { filters: serial.filters } : {};
    setBusy(true); setStatus('connecting', 'Waiting for device…'); log('Requesting a serial device…', 'info');
    try {
      const port = await navigator.serial.requestPort(options);
      await port.open({ baudRate: serial.baudRate ?? 115200, dataBits: serial.dataBits ?? 8, stopBits: serial.stopBits ?? 1, parity: serial.parity ?? 'none', flowControl: serial.flowControl ?? 'none' });
      state.port = port; setStatus('connected', 'Connected'); log('Serial port opened successfully.', 'success'); readLoop(); return port;
    } catch (e) {
      setStatus('idle', 'Disconnected'); log(e.message || 'Unable to connect.', 'error'); throw e;
    } finally { if (!keepBusy) setBusy(false); }
  }

  async function disconnect() {
    setBusy(true);
    try {
      if (state.reader) { try { await state.reader.cancel(); } catch (e) {} try { state.reader.releaseLock(); } catch (e) {} state.reader = null; }
      if (state.port) { try { await state.port.close(); } catch (e) {} state.port = null; }
    } finally {
      setStatus('idle', 'Disconnected'); log('Serial port disconnected.', 'info'); setBusy(false);
    }
  }

  async function runAction(action) {
    if (!state.config) throw new Error('The command profile is not loaded yet.');
    if (action.confirm || action.requiresConfirmation) {
      const msg = action.confirmMessage || `Run "${action.label || action.id || 'command'}"?`;
      if (!window.confirm(msg)) return;
    }
    setBusy(true);
    try {
      await connect(true);
      const list = steps(action);
      if (!list.length) throw new Error(`No serial steps were defined for "${action.label || action.id || 'command'}".`);
      log(`Running ${action.label || action.id || 'command'}…`, 'info');
      for (const step of list) {
        const type = String(step.type || 'send').toLowerCase();
        if (type === 'wait') { const ms = Number(step.delayMs ?? action.delayMs ?? 0); log(`Waiting ${ms}ms…`, 'info'); await delay(ms); continue; }
        if (type === 'send' || type === 'command') { const txt = payload(step, action); log(`>> ${txt}`, 'outgoing'); await write(txt); if (step.delayMs) await delay(step.delayMs); continue; }
        throw new Error(`Unsupported step type: ${step.type}`);
      }
      log(`Completed ${action.label || action.id || 'command'}.`, 'success');
    } finally { setBusy(false); }
  }

  function renderProfile(config) {
    profileName.textContent = config.name || 'Untitled profile';
    profileDesc.textContent = config.description || 'No description provided.';
    const serial = config.serial || {};
    portSettings.textContent = `${serial.baudRate ?? 115200} baud · ${serial.dataBits ?? 8}${(serial.parity ?? 'none') === 'none' ? 'N' : String(serial.parity ?? 'none')[0].toUpperCase()}${serial.stopBits ?? 1}`;
  }

  function renderActions(config) {
    commandList.innerHTML = '';
    state.buttons = [];
    const actions = Array.isArray(config.actions) ? config.actions : [];
    if (!actions.length) { commandList.innerHTML = '<div class="serial-empty-state">No commands were defined in the JSON config.</div>'; return; }
    actions.forEach(action => {
      const card = document.createElement('div'); card.className = 'serial-command-card';
      const title = document.createElement('div'); title.className = 'serial-command-title'; title.textContent = action.label || action.id || 'Unnamed command';
      const desc = document.createElement('div'); desc.className = 'serial-command-description'; desc.textContent = action.description || 'No description provided.';
      const meta = document.createElement('div'); meta.className = 'serial-command-meta';
      const list = steps(action); const sendCount = list.filter(s => String(s.type || 'send').toLowerCase() !== 'wait').length; const waitCount = list.filter(s => String(s.type || '').toLowerCase() === 'wait').length;
      meta.textContent = list.length ? `${sendCount} command${sendCount === 1 ? '' : 's'}${waitCount ? ` · ${waitCount} pause${waitCount === 1 ? '' : 's'}` : ''}` : 'No steps configured';
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'serial-command-button'; btn.textContent = action.buttonLabel || action.label || action.id || 'Run command'; btn.disabled = !supportsSerial();
      btn.addEventListener('click', async () => { try { await runAction(action); } catch (e) { log(e.message || 'Command execution failed.', 'error'); } });
      state.buttons.push(btn); card.append(title, desc, meta, btn); commandList.appendChild(card);
    });
  }

  async function init() {
    setStatus('idle', 'Disconnected'); connectBtn.disabled = true; disconnectBtn.disabled = true;
    if (!supportsSerial()) { setBanner('This browser does not support Web Serial. Please use Chrome, Edge, or Brave in a secure context.', true); commandList.innerHTML = '<div class="serial-empty-state">Web Serial is unavailable in this browser.</div>'; return; }
    setBanner('Connect the device first, then click any command button to send the configured serial command.', false);
    navigator.serial.addEventListener('disconnect', e => { if (state.port && e.target === state.port) { state.port = null; state.reader = null; setStatus('idle', 'Disconnected'); setBusy(false); log('The serial device was disconnected.', 'error'); } });
    try {
      state.config = await loadConfig();
      renderProfile(state.config);
      renderActions(state.config);
      log(`Loaded profile "${state.config.name || 'Untitled profile'}".`, 'info');
      connectBtn.disabled = false;
    } catch (e) {
      setBanner(e.message || 'Unable to load the serial command profile.', true);
      commandList.innerHTML = '<div class="serial-empty-state">Unable to load command definitions.</div>';
      log(e.message || 'Unable to load the serial command profile.', 'error');
    }
    setBusy(false);
  }

  async function loadConfig() {
    const res = await fetch(window.SERIAL_TOOL_CONFIG_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load serial command config (${res.status}).`);
    const config = await res.json();
    if (!config || typeof config !== 'object') throw new Error('Serial command config is invalid.');
    return config;
  }

  connectBtn.addEventListener('click', async () => { try { await connect(); } catch (e) {} });
  disconnectBtn.addEventListener('click', async () => { try { await disconnect(); } catch (e) { log(e.message || 'Failed to disconnect.', 'error'); } });
  clearLogBtn.addEventListener('click', () => { logPanel.innerHTML = ''; log('Log cleared.', 'info'); });
  init();
});

