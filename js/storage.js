/**
 * TYPE//TANK - LocalStorage State & Attempt History Engine
 */

const KEYS = {
  CALLSIGN: 'typetank_callsign',
  ASPECT: 'typetank_aspect',
  CRT: 'typetank_crt',
  MUTED: 'typetank_muted',
  MODE: 'typetank_mode',
  CUSTOM_CHARS: 'typetank_custom_chars',
  FLIGHT_LOGS: 'typetank_flight_logs',
  PERSONAL_BESTS: 'typetank_pb'
};

export class StorageEngine {
  constructor() {
    this.initDefaults();
  }

  initDefaults() {
    if (!localStorage.getItem(KEYS.CALLSIGN)) {
      localStorage.setItem(KEYS.CALLSIGN, 'OPERATOR-1');
    }
    if (!localStorage.getItem(KEYS.ASPECT)) {
      localStorage.setItem(KEYS.ASPECT, 'auto');
    }
    if (localStorage.getItem(KEYS.CRT) === null) {
      localStorage.setItem(KEYS.CRT, 'true');
    }
    if (localStorage.getItem(KEYS.MUTED) === null) {
      localStorage.setItem(KEYS.MUTED, 'false');
    }
    if (!localStorage.getItem(KEYS.MODE)) {
      localStorage.setItem(KEYS.MODE, 'mode1');
    }
    if (!localStorage.getItem(KEYS.CUSTOM_CHARS)) {
      localStorage.setItem(KEYS.CUSTOM_CHARS, JSON.stringify({ uppercase: false, numbers: false, specials: false }));
    }
    if (!localStorage.getItem(KEYS.FLIGHT_LOGS)) {
      localStorage.setItem(KEYS.FLIGHT_LOGS, JSON.stringify([]));
    }
    if (!localStorage.getItem(KEYS.PERSONAL_BESTS)) {
      const defaultPBs = {
        mode1: { score: 0, wpm: 0, accuracy: 0 },
        mode2: { score: 0, wpm: 0, accuracy: 0 },
        mode3: { score: 0, wpm: 0, accuracy: 0 },
        mode4: { score: 0, wpm: 0, accuracy: 0 }
      };
      localStorage.setItem(KEYS.PERSONAL_BESTS, JSON.stringify(defaultPBs));
    }
  }

  // Callsign
  getCallsign() {
    return localStorage.getItem(KEYS.CALLSIGN) || 'OPERATOR-1';
  }

  setCallsign(callsign) {
    const clean = callsign.trim().toUpperCase() || 'OPERATOR-1';
    localStorage.setItem(KEYS.CALLSIGN, clean);
    return clean;
  }

  // Aspect Ratio
  getAspectRatio() {
    return localStorage.getItem(KEYS.ASPECT) || 'auto';
  }

  setAspectRatio(mode) {
    localStorage.setItem(KEYS.ASPECT, mode);
  }

  // CRT Scanlines
  getCRTEnabled() {
    return localStorage.getItem(KEYS.CRT) === 'true';
  }

  setCRTEnabled(enabled) {
    localStorage.setItem(KEYS.CRT, enabled ? 'true' : 'false');
  }

  // Audio Mute
  getMuted() {
    return localStorage.getItem(KEYS.MUTED) === 'true';
  }

  setMuted(muted) {
    localStorage.setItem(KEYS.MUTED, muted ? 'true' : 'false');
  }

  // Arsenal Mode
  getMode() {
    return localStorage.getItem(KEYS.MODE) || 'mode1';
  }

  setMode(modeKey) {
    localStorage.setItem(KEYS.MODE, modeKey);
  }

  // Custom Char matrix toggles
  getCustomChars() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.CUSTOM_CHARS)) || { uppercase: false, numbers: false, specials: false };
    } catch (e) {
      return { uppercase: false, numbers: false, specials: false };
    }
  }

  setCustomChars(obj) {
    localStorage.setItem(KEYS.CUSTOM_CHARS, JSON.stringify(obj));
  }

  // Personal Bests
  getPersonalBests() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.PERSONAL_BESTS));
    } catch (e) {
      return {
        mode1: { score: 0, wpm: 0, accuracy: 0 },
        mode2: { score: 0, wpm: 0, accuracy: 0 },
        mode3: { score: 0, wpm: 0, accuracy: 0 },
        mode4: { score: 0, wpm: 0, accuracy: 0 }
      };
    }
  }

  getModePersonalBest(modeKey) {
    const pbs = this.getPersonalBests();
    return pbs[modeKey] || { score: 0, wpm: 0, accuracy: 0 };
  }

  /**
   * Save a completed game attempt.
   * Returns { isNewRecord, previousPB, newPB }
   */
  saveAttempt(attemptData) {
    const { modeKey, modeName, score, wpm, accuracy, wordsDestroyed, maxCombo } = attemptData;
    const pbs = this.getPersonalBests();
    const currentPB = pbs[modeKey] || { score: 0, wpm: 0, accuracy: 0 };

    let isNewRecord = false;
    if (score > currentPB.score) {
      isNewRecord = true;
      pbs[modeKey] = {
        score,
        wpm,
        accuracy
      };
      localStorage.setItem(KEYS.PERSONAL_BESTS, JSON.stringify(pbs));
    }

    const logs = this.getFlightLogs();
    const newLog = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      modeKey,
      modeName,
      score,
      wpm,
      accuracy,
      wordsDestroyed,
      maxCombo,
      isPersonalBest: isNewRecord
    };

    logs.unshift(newLog); // Newest first
    // Limit log history to last 100 entries
    if (logs.length > 100) {
      logs.pop();
    }
    localStorage.setItem(KEYS.FLIGHT_LOGS, JSON.stringify(logs));

    return {
      isNewRecord,
      previousPB: currentPB,
      newPB: pbs[modeKey]
    };
  }

  // Flight Logs
  getFlightLogs() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.FLIGHT_LOGS)) || [];
    } catch (e) {
      return [];
    }
  }

  purgeLogs() {
    localStorage.setItem(KEYS.FLIGHT_LOGS, JSON.stringify([]));
    const resetPBs = {
      mode1: { score: 0, wpm: 0, accuracy: 0 },
      mode2: { score: 0, wpm: 0, accuracy: 0 },
      mode3: { score: 0, wpm: 0, accuracy: 0 },
      mode4: { score: 0, wpm: 0, accuracy: 0 }
    };
    localStorage.setItem(KEYS.PERSONAL_BESTS, JSON.stringify(resetPBs));
  }

  // Aggregate Stats
  getLifetimeStats() {
    const logs = this.getFlightLogs();
    const pbs = this.getPersonalBests();

    let bestScore = 0;
    let maxWpm = 0;
    let peakAccuracy = 0;
    let totalWordsDestroyed = 0;

    Object.values(pbs).forEach(pb => {
      if (pb.score > bestScore) bestScore = pb.score;
      if (pb.wpm > maxWpm) maxWpm = pb.wpm;
      if (pb.accuracy > peakAccuracy) peakAccuracy = pb.accuracy;
    });

    logs.forEach(log => {
      totalWordsDestroyed += log.wordsDestroyed || 0;
      if (log.wpm > maxWpm) maxWpm = log.wpm;
      if (log.accuracy > peakAccuracy) peakAccuracy = log.accuracy;
    });

    return {
      bestScore,
      maxWpm: Math.round(maxWpm),
      peakAccuracy: Math.round(peakAccuracy),
      totalWordsDestroyed,
      totalSorties: logs.length
    };
  }
}

export const storage = new StorageEngine();
