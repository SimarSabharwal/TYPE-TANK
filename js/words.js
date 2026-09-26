/**
 * TYPE//TANK - Word Dictionaries & Exclusion Engine
 */

export const WORD_DICTIONARIES = {
  // Mode 1: Lowercase only (Military/Tactical/Cyber theme)
  mode1: [
    "tank", "radar", "cannon", "armor", "turret", "vector", "laser", "shield", 
    "target", "ammo", "shell", "signal", "sector", "strike", "drone", "tracer", 
    "bullet", "flank", "orbit", "recoil", "impact", "bunker", "patrol", "combat", 
    "squad", "scout", "matrix", "beacon", "charge", "trench", "platoon", "outpost", 
    "recon", "sentry", "valkyrie", "havoc", "citadel", "spectre", "phantom", "bastion"
  ],

  // Mode 2: Lowercase + Uppercase
  mode2: [
    "Tank", "RadarX", "DeltaForce", "Aegis", "Vanguard", "Overlord", "Paladin", 
    "RogueOne", "CyberSec", "IronDome", "ShadowOps", "AlphaSquad", "ApexPredator", 
    "Hyperion", "TitanV", "ZeroHour", "Firestorm", "GhostRecon", "SteelRain", "NexusPrime", 
    "RedAlert", "CommandPost", "DarkKnight", "StormGuard", "WarHammer", "NightHawk", 
    "SkyNet", "OmegaProtocol", "BioHazard", "StrikeForce", "GridLock", "DeepSpace"
  ],

  // Mode 3: Lowercase + Uppercase + Numbers
  mode3: [
    "Squad5", "Tank99", "v2.0", "Sub10", "Code7", "Unit404", "B-52", "F-35", 
    "Zone51", "Area77", "Agent47", "Sector9", "Protocol7", "Apollo11", "TX-800", 
    "MK-42", "Ref-101", "Corev3", "Batch88", "Delta99", "Alpha01", "Vektor77", 
    "Cyber9000", "Base64", "Node12", "IPv6", "Port80", "Port443", "Gate7", "Nuke50"
  ],

  // Mode 4: Lowercase + Uppercase + Numbers + Special Characters
  mode4: [
    "[tank-01]", "(8+9)", "{cmd-9}", "!alert!", "#def-9", "proj-X", "<fire!>", 
    "sys.exit()", "opt/bin", "v1.5-beta", "core_v2", "fn_init()", "[SYS_ERR]", 
    "data[0]", "$run_all", "*STRIKE*", "path/to/target", "v=100%", "#TAG-88", 
    "!(defend)", "{sec-0}", "arg->val", "sum(a+b)", "[lock-on]", "<shield:100>"
  ]
};

// Character class checkers for granular custom toggles
export const CHAR_PATTERNS = {
  uppercase: /[A-Z]/,
  numbers: /[0-9]/,
  specials: /[^a-zA-Z0-9]/
};

/**
 * Red Bonus Target Exclusion Manager
 * Manages exclusion of starting characters while a red bonus word is active,
 * plus a 3-second cooldown after resolution.
 */
export class ExclusionManager {
  constructor() {
    this.activeRedFirstChars = new Set();
    this.cooldownChars = new Map(); // char -> timestamp when cooldown ends
  }

  reset() {
    this.activeRedFirstChars.clear();
    this.cooldownChars.clear();
  }

  /**
   * Register a new red bonus word active in the arena
   */
  registerRedWord(word) {
    if (!word || word.length === 0) return;
    const firstChar = word[0].toLowerCase();
    this.activeRedFirstChars.add(firstChar);
  }

  /**
   * Called when a red bonus word is resolved (destroyed or missed)
   * Starts a 3-second exclusion cooldown window.
   */
  resolveRedWord(word) {
    if (!word || word.length === 0) return;
    const firstChar = word[0].toLowerCase();
    this.activeRedFirstChars.delete(firstChar);
    this.cooldownChars.set(firstChar, Date.now() + 3000); // 3 sec cooldown
  }

  /**
   * Checks if a word's starting character is currently excluded
   */
  isExcluded(word) {
    if (!word || word.length === 0) return false;
    const firstChar = word[0].toLowerCase();
    
    if (this.activeRedFirstChars.has(firstChar)) {
      return true;
    }

    const cooldownUntil = this.cooldownChars.get(firstChar);
    if (cooldownUntil) {
      if (Date.now() < cooldownUntil) {
        return true;
      } else {
        this.cooldownChars.delete(firstChar);
      }
    }

    return false;
  }
}
