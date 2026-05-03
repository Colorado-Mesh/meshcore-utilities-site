document.addEventListener('DOMContentLoaded', () => {
    const banner = document.getElementById('serial-support-banner');
    const status = document.getElementById('serial-status');
    const profileName = document.getElementById('serial-profile-name');
    const profileDesc = document.getElementById('serial-profile-description');
    const portSettings = document.getElementById('serial-port-settings');
    const connectBtn = document.getElementById('serial-connect-btn');
    const disconnectBtn = document.getElementById('serial-disconnect-btn');
    const clearLogBtn = document.getElementById('serial-clear-log-btn');
    const settingsFileInput = document.getElementById('serial-settings-file');
    const loadSettingsBtn = document.getElementById('serial-load-settings-btn');
    const resetProfileBtn = document.getElementById('serial-reset-profile-btn');
    const commandList = document.getElementById('serial-command-list');
    const logPanel = document.getElementById('serial-log');
    const state = {config: null, defaultConfig: null, port: null, reader: null, busy: false, buttons: []};
    const enc = new TextEncoder();

    const supportsSerial = () => typeof navigator !== 'undefined' && 'serial' in navigator;
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const setBanner = (msg, err) => {
        if (!msg) {
            banner.style.display = 'none';
            banner.textContent = '';
            return;
        }
        banner.style.display = 'block';
        banner.textContent = msg;
        banner.classList.toggle('serial-banner-error', !!err);
        banner.classList.toggle('serial-banner-info', !err);
    };
    const setStatus = (cls, text) => {
        status.className = `serial-status-pill serial-status-${cls}`;
        status.textContent = text;
    };
    const log = (msg, kind = '') => {
        const row = document.createElement('div');
        row.className = `serial-log-line${kind ? ` serial-log-${kind}` : ''}`;
        row.innerHTML = `<span class="serial-log-time">[${new Date().toLocaleTimeString()}]</span> ${esc(msg).replace(/\r/g, '\\r').replace(/\n/g, '\\n')}`;
        logPanel.appendChild(row);
        logPanel.scrollTop = logPanel.scrollHeight;
    };
    const setBusy = busy => {
        state.busy = busy;
        connectBtn.disabled = !supportsSerial() || busy || !state.config;
        disconnectBtn.disabled = !state.port || busy;
        if (loadSettingsBtn) loadSettingsBtn.disabled = busy;
        if (resetProfileBtn) resetProfileBtn.disabled = busy || !state.defaultConfig;
        if (settingsFileInput) settingsFileInput.disabled = busy;
        state.buttons.forEach(btn => {
            btn.disabled = !supportsSerial() || busy || !state.config;
        });
    };
    const normEnding = (v, fallback) => {
        if (typeof v !== 'string' || !v.trim()) return fallback;
        const n = v.trim().toUpperCase();
        if (n === 'CRLF') return '\r\n';
        if (n === 'CR') return '\r';
        if (n === 'LF') return '\n';
        if (n === 'NONE') return '';
        return v;
    };
    const delay = ms => new Promise(r => setTimeout(r, Math.max(0, Number(ms) || 0)));
    const steps = action => {
        const source = Array.isArray(action.steps) && action.steps.length ? action.steps : (typeof action.command === 'string' && action.command.trim() ? [{
            type: 'send', command: action.command, lineEnding: action.lineEnding, delayMs: action.delayMs
        }] : []);
        return source
            .map((step, idx) => ({step, idx}))
            .sort((a, b) => {
                const aOrder = Number.isFinite(Number(a.step?.order)) ? Number(a.step.order) : Number.MAX_SAFE_INTEGER;
                const bOrder = Number.isFinite(Number(b.step?.order)) ? Number(b.step.order) : Number.MAX_SAFE_INTEGER;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return a.idx - b.idx;
            })
            .map(item => item.step);
    };
    const payload = (step, action) => `${String(step.command ?? '').replaceAll('{profileName}', state.config?.name || '').replaceAll('{commandLabel}', action.label || '').replaceAll('{commandId}', action.id || '')}`;
    const clone = value => JSON.parse(JSON.stringify(value));

    function pathHashMode(prefixSize) {
        if (prefixSize === 1) return 0;
        if (prefixSize === 2) return 1;
        if (prefixSize === 3) return 2;
        throw new Error('prefix_size must be one of 1, 2, or 3.');
    }

    function readField(input, keys) {
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(input, key)) return input[key];
            if (!key.includes('.')) continue;
            const parts = key.split('.');
            let current = input;
            let found = true;
            for (const part of parts) {
                if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) {
                    found = false;
                    break;
                }
                current = current[part];
            }
            if (found) return current;
        }
        return undefined;
    }

    function toNumber(value, fieldName, errors, {min = null, max = null, integer = false} = {}) {
        if (value === undefined || value === null) return null;
        const num = Number(value);
        if (!Number.isFinite(num)) {
            errors.push(`${fieldName} must be a number.`);
            return null;
        }
        if (integer && !Number.isInteger(num)) errors.push(`${fieldName} must be an integer.`);
        if (min !== null && num < min) errors.push(`${fieldName} must be >= ${min}.`);
        if (max !== null && num > max) errors.push(`${fieldName} must be <= ${max}.`);
        return num;
    }

    function toOptionalString(value, fieldName, errors) {
        if (value === undefined || value === null) return null;
        if (typeof value !== 'string') {
            errors.push(`${fieldName} must be a string.`);
            return null;
        }
        return value;
    }

    function validateRepeaterSettings(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Settings JSON must be an object.');
        const errors = [];
        const warnings = [];

        const settings = {
            radio: readField(raw, ['radio']),
            txdelay: toNumber(readField(raw, ['txdelay']), 'txdelay', errors, {min: 0, max: 3}),
            direct_txdelay: toNumber(readField(raw, ['direct.txdelay', 'direct_txdelay']), 'direct_txdelay', errors, {
                min: 0, max: 3
            }),
            rxdelay: toNumber(readField(raw, ['rxdelay']), 'rxdelay', errors, {min: 0, max: 20}),
            advert_interval: toNumber(readField(raw, ['advert.interval', 'advert_interval']), 'advert_interval', errors, {
                min: 0, integer: true
            }),
            flood_advert_interval: toNumber(readField(raw, ['flood.advert.interval', 'flood_advert_interval']), 'flood_advert_interval', errors, {
                min: 0, integer: true
            }),
            admin_password: toOptionalString(readField(raw, ['password', 'admin_password']), 'password', errors),
            guest_password: toOptionalString(readField(raw, ['guest.password', 'guest_password']), 'guest.password', errors),
            name: toOptionalString(readField(raw, ['name']), 'name', errors),
            owner_info: readField(raw, ['owner', 'owner_info']),
            private_key: toOptionalString(readField(raw, ['prv.key', 'private_key']), 'prv.key', errors),
            regions: readField(raw, ['regions']),
            repeater_type: toNumber(readField(raw, ['repeater_type']), 'repeater_type', errors, {integer: true}),
            prefix_size: toNumber(readField(raw, ['prefix_size']), 'prefix_size', errors, {integer: true})
        };

        if (settings.prefix_size !== null && ![1, 2, 3].includes(settings.prefix_size)) {
            errors.push('prefix_size must be one of 1, 2, or 3.');
        }

        if (settings.regions !== undefined && settings.regions !== null) {
            if (!settings.regions || typeof settings.regions !== 'object' || Array.isArray(settings.regions)) {
                errors.push('regions must be an object with "all" and optional "home".');
            } else {
                const all = settings.regions.all;
                const home = settings.regions.home;
                if (!Array.isArray(all) || all.some(region => typeof region !== 'string' || !region.trim())) {
                    errors.push('regions.all must be an array of non-empty strings.');
                } else if (typeof home === 'string' && !all.includes(home)) {
                    errors.push('regions.home must be one of the values in regions.all.');
                } else if (home !== undefined && home !== null && typeof home !== 'string') {
                    errors.push('regions.home must be a string when provided.');
                }
            }
        }

        if (settings.owner_info !== undefined && settings.owner_info !== null && typeof settings.owner_info !== 'string') {
            warnings.push('owner is not a string; skipping owner command generation on the client.');
        }

        if (errors.length) throw new Error(`Settings validation failed: ${errors.join(' ')}`);
        return {settings, warnings};
    }

    function buildCommandsFromSettings(settings) {
        const commands = [];
        commands.push({
            order: 1, type: 'send', command: 'erase',
        });
        commands.push({
            order: 2, type: 'wait', delayMs: 1000,
        });
        commands.push({
            order: 3, type: 'send', command: `set radio ${settings.radio}`,
        });
        commands.push({
            order: 4, type: 'wait', delayMs: 150,
        });
        commands.push({
            order: 5, type: 'send', command: `set prv.key ${settings.private_key}`,
        });
        commands.push({
            order: 6, type: 'wait', delayMs: 150,
        });
        commands.push({
            order: 7, type: 'send', command: `set name ${settings.name}`,
        });
        commands.push({
            order: 8, type: 'wait', delayMs: 150,
        });
        for (const region of settings.regions.all) {
            commands.push({order: 9, type: 'send', command: `region put ${region}`});
        }
        commands.push({order: 10, type: 'wait', delayMs: 1000});
        commands.push({order: 11, type: 'send', command: `region home ${settings.regions.home}`});
        commands.push({order: 12, type: 'wait', delayMs: 150});
        commands.push({order: 13, type: 'send', command: `region save`});
        commands.push({order: 14, type: 'wait', delayMs: 150});
        commands.push({order: 15, type: 'send', command: `set txdelay ${settings.txdelay.toFixed(2)}`});
        commands.push({order: 16, type: 'wait', delayMs: 150});
        commands.push({order: 17, type: 'send', command: `set direct.txdelay ${settings.direct_txdelay.toFixed(2)}`});
        commands.push({order: 18, type: 'wait', delayMs: 150});
        commands.push({order: 19, type: 'send', command: `set rxdelay ${settings.txdelay.toFixed(2)}`});
        commands.push({order: 20, type: 'wait', delayMs: 150});
        commands.push({
            order: 21, type: 'send', command: `set advert.interval ${settings.advert_interval}`,
        });
        commands.push({
            order: 22, type: 'wait', delayMs: 150,
        });
        commands.push({
            order: 23, type: 'send', command: `set flood.advert.interval ${settings.flood_advert_interval}`,
        });
        commands.push({
            order: 24, type: 'wait', delayMs: 150,
        });
        commands.push({
            order: 25, type: 'send', command: `set path.hash.size ${pathHashMode(settings.prefix_size)}`,
        });
        commands.push({
            order: 26, type: 'wait', delayMs: 150,
        });
        commands.push({
            order: 27,
            type: 'send',
            command: settings.guest_password === '' ? 'set guest.password ' : `set guest.password ${settings.guest_password}`,
        });
        commands.push({
            order: 28, type: 'wait', delayMs: 150,
        });
        commands.push({
            order: 29, type: 'send', command: `password ${settings.admin_password}`,
        });
        commands.push({
            order: 30, type: 'wait', delayMs: 150,
        });
        commands.push({
            order: 29, type: 'send', command: `reboot`,
        });

        return commands;
    }

    function buildProfileFromSettings(rawSettings, fileName = 'uploaded-settings.json') {
        const {settings, warnings} = validateRepeaterSettings(rawSettings);
        const commands = buildCommandsFromSettings(settings);
        if (!commands.length) throw new Error('No recognized repeater settings were found to generate commands.');
        const defaultSerial = state.defaultConfig?.serial || {};
        const config = {
            name: `Uploaded Repeater Settings (${fileName})`,
            description: `Generated locally in your browser from ${fileName}. Sensitive values are never sent to the backend server.`,
            serial: {
                baudRate: defaultSerial.baudRate ?? 115200,
                dataBits: defaultSerial.dataBits ?? 8,
                stopBits: defaultSerial.stopBits ?? 1,
                parity: defaultSerial.parity ?? 'none',
                flowControl: defaultSerial.flowControl ?? 'none',
                defaultLineEnding: defaultSerial.defaultLineEnding ?? 'CRLF'
            },
            actions: [{
                id: 'apply_repeater_settings',
                label: 'Apply Repeater Settings',
                description: `Send ${commands.length} generated command${commands.length === 1 ? '' : 's'} from the uploaded settings file.`,
                confirm: true,
                confirmMessage: `Send ${commands.length} command${commands.length === 1 ? '' : 's'} to the connected device?`,
                steps: commands
            }]
        };
        return {config, warnings, commandCount: commands.length};
    }

    function activateConfig(config, message) {
        state.config = clone(config);
        renderProfile(state.config);
        renderActions(state.config);
        if (message) log(message, 'info');
        setBusy(false);
    }

    async function write(text) {
        if (!state.port?.writable) throw new Error('No serial port is open.');
        const writer = state.port.writable.getWriter();
        // Automatically hit enter to send command
        text = text + "\r\n";
        try {
            await writer.write(enc.encode(text));
        } finally {
            writer.releaseLock();
        }
    }

    function readLoop() {
        if (!state.port?.readable || state.reader) return;
        const decoder = new TextDecoderStream();
        state.port.readable.pipeTo(decoder.writable).catch(() => {
        });
        state.reader = decoder.readable.getReader();
        (async () => {
            try {
                while (true) {
                    const {value, done} = await state.reader.read();
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

    async function connect(keepBusy = false) {
        if (!supportsSerial()) throw new Error('Web Serial is not supported in this browser.');
        if (state.port) return state.port;
        const serial = state.config?.serial || {};
        const options = Array.isArray(serial.filters) && serial.filters.length ? {filters: serial.filters} : {};
        setBusy(true);
        setStatus('connecting', 'Waiting for device…');
        log('Requesting a serial device…', 'info');
        try {
            const port = await navigator.serial.requestPort(options);
            await port.open({
                baudRate: serial.baudRate ?? 115200,
                dataBits: serial.dataBits ?? 8,
                stopBits: serial.stopBits ?? 1,
                parity: serial.parity ?? 'none',
                flowControl: serial.flowControl ?? 'none'
            });
            state.port = port;
            setStatus('connected', 'Connected');
            log('Serial port opened successfully.', 'success');
            readLoop();
            return port;
        } catch (e) {
            setStatus('idle', 'Disconnected');
            log(e.message || 'Unable to connect.', 'error');
            throw e;
        } finally {
            if (!keepBusy) setBusy(false);
        }
    }

    async function disconnect() {
        setBusy(true);
        try {
            if (state.reader) {
                try {
                    await state.reader.cancel();
                } catch (e) {
                }
                try {
                    state.reader.releaseLock();
                } catch (e) {
                }
                state.reader = null;
            }
            if (state.port) {
                try {
                    await state.port.close();
                } catch (e) {
                }
                state.port = null;
            }
        } finally {
            setStatus('idle', 'Disconnected');
            log('Serial port disconnected.', 'info');
            setBusy(false);
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
                if (type === 'wait') {
                    const ms = Number(step.delayMs ?? action.delayMs ?? 0);
                    log(`Waiting ${ms}ms…`, 'info');
                    await delay(ms);
                    continue;
                }
                if (type === 'send' || type === 'command') {
                    const txt = payload(step, action);
                    log(`>> ${txt}`, 'outgoing');
                    await write(txt);
                    if (step.delayMs) await delay(step.delayMs);
                    continue;
                }
                throw new Error(`Unsupported step type: ${step.type}`);
            }
            log(`Completed ${action.label || action.id || 'command'}.`, 'success');
        } finally {
            setBusy(false);
        }
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
        if (!actions.length) {
            commandList.innerHTML = '<div class="serial-empty-state">No commands were defined in the JSON config.</div>';
            return;
        }
        actions.forEach(action => {
            const card = document.createElement('div');
            card.className = 'serial-command-card';
            const title = document.createElement('div');
            title.className = 'serial-command-title';
            title.textContent = action.label || action.id || 'Unnamed command';
            const desc = document.createElement('div');
            desc.className = 'serial-command-description';
            desc.textContent = action.description || 'No description provided.';
            const meta = document.createElement('div');
            meta.className = 'serial-command-meta';
            const list = steps(action);
            const commands = list.filter(s => String(s.type || 'send').toLowerCase() !== 'wait').map(s => s.command || 'unknown');
            if (commands.length) {
                const ul = document.createElement('ul');
                ul.style.margin = '0';
                ul.style.paddingLeft = '20px';
                commands.forEach(cmd => {
                    const li = document.createElement('li');
                    const code = document.createElement('code');
                    code.textContent = cmd;
                    li.appendChild(code);
                    ul.appendChild(li);
                });
                meta.appendChild(ul);
            } else {
                meta.textContent = 'No commands configured';
            }
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'serial-command-button';
            btn.textContent = action.buttonLabel || action.label || action.id || 'Run command';
            btn.disabled = !supportsSerial();
            btn.addEventListener('click', async () => {
                try {
                    await runAction(action);
                } catch (e) {
                    log(e.message || 'Command execution failed.', 'error');
                }
            });
            state.buttons.push(btn);
            card.append(title, desc, meta, btn);
            commandList.appendChild(card);
        });
    }

    async function init() {
        setStatus('idle', 'Disconnected');
        connectBtn.disabled = true;
        disconnectBtn.disabled = true;
        if (!supportsSerial()) {
            setBanner('This browser does not support Web Serial. Please use Chrome, Edge, or Brave in a secure context.', true);
            commandList.innerHTML = '<div class="serial-empty-state">Web Serial is unavailable in this browser.</div>';
            return;
        }
        setBanner('Connect the device first, then click any command button. Uploaded settings JSON files are parsed entirely in your browser.', false);
        navigator.serial.addEventListener('disconnect', e => {
            if (state.port && e.target === state.port) {
                state.port = null;
                state.reader = null;
                setStatus('idle', 'Disconnected');
                setBusy(false);
                log('The serial device was disconnected.', 'error');
            }
        });
        try {
            const defaultConfig = await loadConfig();
            state.defaultConfig = clone(defaultConfig);
            activateConfig(defaultConfig, `Loaded default profile "${defaultConfig.name || 'Untitled profile'}".`);
        } catch (e) {
            setBanner(e.message || 'Unable to load the serial command profile.', true);
            commandList.innerHTML = '<div class="serial-empty-state">Unable to load command definitions.</div>';
            log(e.message || 'Unable to load the serial command profile.', 'error');
        }
        setBusy(false);
    }

    async function loadConfig() {
        const res = await fetch(window.SERIAL_TOOL_CONFIG_URL, {cache: 'no-store'});
        if (!res.ok) throw new Error(`Failed to load serial command config (${res.status}).`);
        const config = await res.json();
        if (!config || typeof config !== 'object') throw new Error('Serial command config is invalid.');
        return config;
    }

    async function loadSettingsFromSelectedFile() {
        const file = settingsFileInput?.files?.[0];
        if (!file) throw new Error('Select a JSON settings file first.');
        const text = await file.text();
        let json;
        try {
            json = JSON.parse(text);
        } catch (e) {
            throw new Error('Uploaded file is not valid JSON.');
        }
        const {config, warnings, commandCount} = buildProfileFromSettings(json, file.name);
        activateConfig(config, `Loaded ${file.name} and generated ${commandCount} serial command${commandCount === 1 ? '' : 's'}.`);
        if (warnings.length) warnings.forEach(warning => log(warning, 'info'));
        setBanner('Using uploaded settings profile. File parsing and command generation happen entirely client-side.', false);
    }

    connectBtn.addEventListener('click', async () => {
        try {
            await connect();
        } catch (e) {
        }
    });
    disconnectBtn.addEventListener('click', async () => {
        try {
            await disconnect();
        } catch (e) {
            log(e.message || 'Failed to disconnect.', 'error');
        }
    });
    clearLogBtn.addEventListener('click', () => {
        logPanel.innerHTML = '';
        log('Log cleared.', 'info');
    });
    loadSettingsBtn?.addEventListener('click', async () => {
        setBusy(true);
        try {
            await loadSettingsFromSelectedFile();
        } catch (e) {
            setBanner(e.message || 'Unable to load the uploaded settings file.', true);
            log(e.message || 'Unable to load the uploaded settings file.', 'error');
            setBusy(false);
        }
    });
    resetProfileBtn?.addEventListener('click', async () => {
        if (!state.defaultConfig) return;
        activateConfig(state.defaultConfig, `Restored default profile "${state.defaultConfig.name || 'Untitled profile'}".`);
        setBanner('Using default command profile from static/data/default_serial_commands.json.', false);
    });
    init();
});

