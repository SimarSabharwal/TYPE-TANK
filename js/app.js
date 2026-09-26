/**
 * TYPE//TANK - App Controller, Navigation Router & Confetti Engine
 */

import { storage } from './storage.js';
import { sound } from './audio.js';
import { GameEngine } from './game.js';
import { WORD_DICTIONARIES } from './words.js';

class AppController {
  constructor() {
    this.activeScreenId = 'screen-login';
    this.gameEngine = null;

    // DOM Elements
    this.arcadeWrapper = document.getElementById('arcade-wrapper');
    this.headerCallsign = document.getElementById('header-callsign');
    this.headerMode = document.getElementById('header-mode');
    this.btnSwitchCallsign = document.getElementById('btn-switch-callsign');
    this.btnToggleCRT = document.getElementById('btn-toggle-crt');
    this.btnToggleAudio = document.getElementById('btn-toggle-audio');
    this.btnToggleAspect = document.getElementById('btn-toggle-aspect');
    this.btnNavRecords = document.getElementById('btn-nav-records');

    // Confetti Canvas
    this.confettiCanvas = document.getElementById('confetti-canvas');
    this.confettiCtx = this.confettiCanvas.getContext('2d');
    this.confettiParticles = [];
    this.confettiAnimId = null;

    this.init();
  }

  init() {
    this.loadPersistentState();
    this.initGameEngine();
    this.bindEvents();
    this.showScreen('screen-login');
  }

  loadPersistentState() {
    // 1. Callsign
    const callsign = storage.getCallsign();
    this.headerCallsign.textContent = callsign;
    const inputCallsign = document.getElementById('input-callsign');
    if (inputCallsign) inputCallsign.value = callsign;

    // 2. CRT Scanline Toggle
    const crtEnabled = storage.getCRTEnabled();
    document.body.classList.toggle('crt-enabled', crtEnabled);
    this.btnToggleCRT.textContent = `CRT: ${crtEnabled ? 'ON' : 'OFF'}`;

    // 3. Audio Mute
    const muted = storage.getMuted();
    sound.setMuted(muted);
    this.btnToggleAudio.textContent = `SOUND: ${muted ? 'OFF' : 'ON'}`;

    // 4. Aspect Ratio
    const aspect = storage.getAspectRatio();
    this.applyAspectRatio(aspect);

    // 5. Mode
    const modeKey = storage.getMode();
    this.selectMode(modeKey, false);
  }

  initGameEngine() {
    const canvas = document.getElementById('game-canvas');
    this.gameEngine = new GameEngine(canvas, {
      onUpdate: (stats) => this.updateHUDStats(stats),
      onGameOver: (result) => this.handleGameOver(result)
    });
  }

  applyAspectRatio(aspect) {
    storage.setAspectRatio(aspect);
    this.arcadeWrapper.className = `aspect-${aspect.replace(':', '-')}`;
    
    let label = 'AUTO';
    if (aspect === '16:9') label = '16:9';
    if (aspect === '4:3') label = '4:3';
    this.btnToggleAspect.textContent = `ASPECT: ${label}`;

    // Trigger canvas resize
    if (this.gameEngine) {
      setTimeout(() => this.gameEngine.handleResize(), 50);
    }
  }

  showScreen(screenId) {
    this.activeScreenId = screenId;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
    }

    sound.playClick();

    // Screen specific hooks
    if (screenId === 'screen-login') {
      const input = document.getElementById('input-callsign');
      if (input) setTimeout(() => input.focus(), 100);
    } else if (screenId === 'screen-settings') {
      this.updateSettingsUI();
    } else if (screenId === 'screen-game') {
      this.startCombatSortie();
    } else if (screenId === 'screen-records') {
      this.renderFlightLogs();
    }
  }

  bindEvents() {
    // --- Header Actions ---
    this.btnSwitchCallsign.addEventListener('click', () => {
      this.showScreen('screen-login');
    });

    this.btnToggleCRT.addEventListener('click', () => {
      const enabled = !storage.getCRTEnabled();
      storage.setCRTEnabled(enabled);
      document.body.classList.toggle('crt-enabled', enabled);
      this.btnToggleCRT.textContent = `CRT: ${enabled ? 'ON' : 'OFF'}`;
      sound.playClick();
    });

    this.btnToggleAudio.addEventListener('click', () => {
      const muted = sound.toggleMute();
      storage.setMuted(muted);
      this.btnToggleAudio.textContent = `SOUND: ${muted ? 'OFF' : 'ON'}`;
      sound.playClick();
    });

    this.btnToggleAspect.addEventListener('click', () => {
      const current = storage.getAspectRatio();
      const modes = ['auto', '16:9', '4:3'];
      const nextIdx = (modes.indexOf(current) + 1) % modes.length;
      this.applyAspectRatio(modes[nextIdx]);
      sound.playClick();
    });

    this.btnNavRecords.addEventListener('click', () => {
      if (this.activeScreenId === 'screen-game') {
        this.gameEngine.stop();
      }
      this.showScreen('screen-records');
    });

    // --- Screen 1: Login Form ---
    const loginForm = document.getElementById('form-login');
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitLogin();
    });

    // --- Screen 2: Settings Mode Selection ---
    document.querySelectorAll('.mode-card').forEach(card => {
      card.addEventListener('click', () => {
        const modeKey = card.dataset.mode;
        this.selectMode(modeKey, true);
        sound.playClick();
      });
    });

    // Matrix Checkboxes
    ['chk-uppercase', 'chk-numbers', 'chk-specials'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        this.syncMatrixToMode();
        sound.playClick();
      });
    });

    // Aspect Buttons in Settings
    document.querySelectorAll('.btn-aspect').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-aspect').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.applyAspectRatio(btn.dataset.aspect);
        sound.playClick();
      });
    });

    document.getElementById('btn-settings-briefing').addEventListener('click', () => {
      this.showScreen('screen-instructions');
    });

    // --- Screen 3: Instructions ---
    document.getElementById('btn-start-game').addEventListener('click', () => {
      this.showScreen('screen-game');
    });

    // --- Screen 5: Result Screen ---
    document.getElementById('btn-result-replay').addEventListener('click', () => {
      this.showScreen('screen-game');
    });
    document.getElementById('btn-result-records').addEventListener('click', () => {
      this.showScreen('screen-records');
    });
    document.getElementById('btn-result-settings').addEventListener('click', () => {
      this.showScreen('screen-settings');
    });

    // --- Screen 6: Flight Logs ---
    document.querySelectorAll('.btn-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderFlightLogs(btn.dataset.filter);
        sound.playClick();
      });
    });

    document.getElementById('btn-purge-logs').addEventListener('click', () => {
      if (confirm('ARE YOU SURE YOU WANT TO PURGE ALL FLIGHT LOGS AND PERSONAL RECORDS?')) {
        storage.purgeLogs();
        this.renderFlightLogs();
        sound.playClick();
      }
    });

    document.getElementById('btn-records-back').addEventListener('click', () => {
      this.showScreen('screen-settings');
    });

    // --- Global Keyboard Listener ---
    window.addEventListener('keydown', (e) => this.handleGlobalKeyDown(e));
  }

  submitLogin() {
    const input = document.getElementById('input-callsign');
    const val = input ? input.value : '';
    const cleanCallsign = storage.setCallsign(val);
    this.headerCallsign.textContent = cleanCallsign;
    this.showScreen('screen-settings');
  }

  selectMode(modeKey, updateStorage = true) {
    if (updateStorage) storage.setMode(modeKey);

    document.querySelectorAll('.mode-card').forEach(c => {
      c.classList.toggle('active', c.dataset.mode === modeKey);
    });

    // Update Header Mode Badge
    const modeNames = {
      mode1: 'MODE 1 [ALPHA]',
      mode2: 'MODE 2 [BRAVO]',
      mode3: 'MODE 3 [CHARLIE]',
      mode4: 'MODE 4 [DELTA]'
    };
    this.headerMode.textContent = modeNames[modeKey] || 'MODE 1 [ALPHA]';

    // Sync Matrix Toggles
    const chkUpper = document.getElementById('chk-uppercase');
    const chkNum = document.getElementById('chk-numbers');
    const chkSpec = document.getElementById('chk-specials');

    if (modeKey === 'mode1') {
      chkUpper.checked = false; chkNum.checked = false; chkSpec.checked = false;
    } else if (modeKey === 'mode2') {
      chkUpper.checked = true; chkNum.checked = false; chkSpec.checked = false;
    } else if (modeKey === 'mode3') {
      chkUpper.checked = true; chkNum.checked = true; chkSpec.checked = false;
    } else if (modeKey === 'mode4') {
      chkUpper.checked = true; chkNum.checked = true; chkSpec.checked = true;
    }

    storage.setCustomChars({
      uppercase: chkUpper.checked,
      numbers: chkNum.checked,
      specials: chkSpec.checked
    });

    this.updatePreviewBar(modeKey);
  }

  syncMatrixToMode() {
    const upper = document.getElementById('chk-uppercase').checked;
    const num = document.getElementById('chk-numbers').checked;
    const spec = document.getElementById('chk-specials').checked;

    let targetMode = 'mode1';
    if (spec) {
      targetMode = 'mode4';
    } else if (num) {
      targetMode = 'mode3';
    } else if (upper) {
      targetMode = 'mode2';
    }

    this.selectMode(targetMode, true);
  }

  updatePreviewBar(modeKey) {
    const previewEl = document.getElementById('live-word-preview');
    if (!previewEl) return;
    const sampleWords = (WORD_DICTIONARIES[modeKey] || WORD_DICTIONARIES.mode1).slice(0, 6).join(', ');
    previewEl.textContent = sampleWords;
  }

  updateSettingsUI() {
    const aspect = storage.getAspectRatio();
    document.querySelectorAll('.btn-aspect').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.aspect === aspect);
    });
  }

  startCombatSortie() {
    const modeKey = storage.getMode();
    const callsign = storage.getCallsign();

    document.getElementById('hud-op').textContent = callsign;
    document.getElementById('hud-mode').textContent = modeKey.toUpperCase();

    this.gameEngine.start(modeKey);
  }

  updateHUDStats({ score, health, combo, wpm, accuracy }) {
    document.getElementById('hud-score').textContent = String(score).padStart(6, '0');
    document.getElementById('hud-combo').textContent = `${combo.toFixed(1)}X`;
    document.getElementById('hud-wpm').textContent = wpm;
    document.getElementById('hud-acc').textContent = `${accuracy}%`;

    const fillEl = document.getElementById('hud-health-fill');
    if (fillEl) {
      fillEl.style.width = `${Math.max(0, health)}%`;
      fillEl.className = 'health-fill ' + (health > 50 ? 'green' : health > 25 ? 'amber' : 'red');
    }
  }

  handleGameOver(result) {
    const { score, wpm, accuracy, wordsDestroyed, maxCombo, modeKey } = result;

    const modeNames = {
      mode1: 'MODE 1 [ALPHA]',
      mode2: 'MODE 2 [BRAVO]',
      mode3: 'MODE 3 [CHARLIE]',
      mode4: 'MODE 4 [DELTA]'
    };
    const modeName = modeNames[modeKey] || modeKey;

    // Save attempt to LocalStorage
    const { isNewRecord, previousPB, newPB } = storage.saveAttempt({
      modeKey,
      modeName,
      score,
      wpm,
      accuracy,
      wordsDestroyed,
      maxCombo
    });

    // Populate Result screen elements
    document.getElementById('res-score').textContent = String(score).padStart(6, '0');
    document.getElementById('res-wpm').textContent = wpm;
    document.getElementById('res-acc').textContent = `${accuracy}%`;
    document.getElementById('res-targets').textContent = wordsDestroyed;
    document.getElementById('res-combo').textContent = `${maxCombo.toFixed(1)}X`;
    document.getElementById('res-mode').textContent = modeName;

    const bannerEl = document.getElementById('record-banner');
    const compEl = document.getElementById('pb-comparison-box');

    if (isNewRecord) {
      bannerEl.classList.remove('hidden');
      sound.playFanfare();
      this.launchConfetti();

      compEl.innerHTML = `★ NEW RECORD FOR ${modeName}! PREVIOUS BEST: ${previousPB.score} PTS ★`;
    } else {
      bannerEl.classList.add('hidden');
      const delta = previousPB.score - score;
      compEl.innerHTML = `PERSONAL BEST: ${previousPB.score} PTS (WPM: ${previousPB.wpm}) — ${delta} PTS TO SURPASS RECORD`;
    }

    this.showScreen('screen-result');
  }

  /**
   * Launch Arcade Confetti Celebration
   */
  launchConfetti() {
    this.confettiCanvas.width = this.arcadeWrapper.clientWidth;
    this.confettiCanvas.height = this.arcadeWrapper.clientHeight;

    this.confettiParticles = [];
    const colors = ['#33ff33', '#66ff66', '#ff2244', '#ffb700', '#ffffff'];

    for (let i = 0; i < 120; i++) {
      this.confettiParticles.push({
        x: Math.random() * this.confettiCanvas.width,
        y: Math.random() * this.confettiCanvas.height - this.confettiCanvas.height,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 6,
        rotation: Math.random() * Math.PI * 2,
        rSpeed: (Math.random() - 0.5) * 0.2
      });
    }

    const renderConfetti = () => {
      this.confettiCtx.clearRect(0, 0, this.confettiCanvas.width, this.confettiCanvas.height);

      let activeCount = 0;
      this.confettiParticles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rSpeed;

        if (p.y < this.confettiCanvas.height + 20) {
          activeCount++;
          this.confettiCtx.save();
          this.confettiCtx.translate(p.x, p.y);
          this.confettiCtx.rotate(p.rotation);
          this.confettiCtx.fillStyle = p.color;
          this.confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          this.confettiCtx.restore();
        }
      });

      if (activeCount > 0) {
        this.confettiAnimId = requestAnimationFrame(renderConfetti);
      }
    };

    if (this.confettiAnimId) cancelAnimationFrame(this.confettiAnimId);
    this.confettiAnimId = requestAnimationFrame(renderConfetti);
  }

  renderFlightLogs(filterMode = 'all') {
    // 1. Lifetime Overview
    const lifetime = storage.getLifetimeStats();
    document.getElementById('life-score').textContent = lifetime.bestScore;
    document.getElementById('life-wpm').textContent = lifetime.maxWpm;
    document.getElementById('life-acc').textContent = `${lifetime.peakAccuracy}%`;
    document.getElementById('life-targets').textContent = lifetime.totalWordsDestroyed;

    // 2. Personal Bests Quad
    const pbs = storage.getPersonalBests();
    ['mode1', 'mode2', 'mode3', 'mode4'].forEach(m => {
      const p = pbs[m] || { score: 0, wpm: 0 };
      const sEl = document.getElementById(`pb-${m.replace('mode', 'm')}-score`);
      const wEl = document.getElementById(`pb-${m.replace('mode', 'm')}-wpm`);
      if (sEl) sEl.textContent = p.score;
      if (wEl) wEl.textContent = p.wpm;
    });

    // 3. Flight Logs Table
    const logs = storage.getFlightLogs();
    const tbody = document.getElementById('logs-tbody');
    tbody.innerHTML = '';

    const filtered = filterMode === 'all' ? logs : logs.filter(l => l.modeKey === filterMode);

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">NO FLIGHT LOGS RECORDED YET.</td></tr>';
      return;
    }

    filtered.forEach(log => {
      const tr = document.createElement('tr');
      const dateStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      tr.innerHTML = `
        <td>${dateStr}</td>
        <td>${log.modeName}</td>
        <td class="${log.isPersonalBest ? 'glowing-green' : ''}">${log.score} ${log.isPersonalBest ? '<span style="color:var(--amber-gold);font-weight:bold;">★ PB</span>' : ''}</td>
        <td>${log.wpm}</td>
        <td>${log.accuracy}%</td>
        <td class="amber-text">${(log.maxCombo || 1).toFixed(1)}X</td>
      `;
      tbody.appendChild(tr);
    });
  }

  handleGlobalKeyDown(e) {
    // Don't capture keys if typing inside input box (Login Screen)
    if (e.target && e.target.tagName === 'INPUT') {
      if (e.key === 'Enter') {
        this.submitLogin();
      }
      return;
    }

    // Gameplay Controls
    if (this.activeScreenId === 'screen-game') {
      if (e.key === 'Escape') {
        // Abort Sortie
        this.gameEngine.stop();
        this.showScreen('screen-settings');
        return;
      }

      // Single character typing keystrokes
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        this.gameEngine.handleKeystroke(e.key);
      }
      return;
    }

    // Menu Navigation Shortcuts
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (this.activeScreenId === 'screen-login') {
        this.submitLogin();
      } else if (this.activeScreenId === 'screen-settings') {
        this.showScreen('screen-instructions');
      } else if (this.activeScreenId === 'screen-instructions') {
        this.showScreen('screen-game');
      } else if (this.activeScreenId === 'screen-result') {
        this.showScreen('screen-game');
      }
    } else if (e.key === 'r' || e.key === 'R') {
      if (this.activeScreenId === 'screen-result') {
        this.showScreen('screen-records');
      }
    }
  }
}

// Bootstrap app when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new AppController();
});
