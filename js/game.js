/**
 * TYPE//TANK - 60 FPS HTML5 Canvas 2D Combat Engine
 */

import { WORD_DICTIONARIES, ExclusionManager } from './words.js';
import { sound } from './audio.js';

export class GameEngine {
  constructor(canvasElement, hudCallbacks = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.hudCallbacks = hudCallbacks;

    this.exclusionManager = new ExclusionManager();

    this.isRunning = false;
    this.isPaused = false;
    this.animFrameId = null;

    // Dimensions
    this.width = canvasElement.width;
    this.height = canvasElement.height;

    // Game Parameters
    this.modeKey = 'mode1';
    this.wordList = [];

    // State
    this.words = [];
    this.lockedWord = null;
    this.bullets = [];
    this.particles = [];
    
    // Tank & Turret state
    this.tankX = this.width / 2;
    this.tankY = this.height - 45;
    this.turretAngle = -Math.PI / 2; // Pointing straight up (-90 deg)
    this.targetTurretAngle = -Math.PI / 2;
    this.barrelRecoil = 0;

    // Gameplay Metrics
    this.score = 0;
    this.health = 100;
    this.combo = 1;
    this.maxCombo = 1;
    this.wordsDestroyed = 0;
    this.totalKeystrokes = 0;
    this.correctKeystrokes = 0;
    this.startTime = 0;
    this.elapsedTime = 0; // in seconds

    // Spawning & Difficulty control
    this.spawnTimer = 0;
    this.spawnInterval = 2000; // ms between word spawns
    this.baseWordSpeed = 0.8;
    this.bonusChance = 0.18; // 18% bonus word chance

    // Screen Shake
    this.shakeDuration = 0;
    this.shakeIntensity = 0;

    // Resize handler
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
  }

  handleResize() {
    if (!this.canvas.parentElement) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    const scaleX = rect.width / (this.width || rect.width);
    const scaleY = rect.height / (this.height || rect.height);

    // Rescale active word coordinates smoothly
    this.words.forEach(w => {
      w.x = w.x * scaleX;
      w.y = w.y * scaleY;
    });

    this.width = rect.width;
    this.height = rect.height;
    this.tankX = this.width / 2;
    this.tankY = this.height - 45;
  }

  start(modeKey = 'mode1', customChars = null) {
    this.handleResize();
    this.modeKey = modeKey;
    
    // Load words based on mode or custom matrix
    let dict = WORD_DICTIONARIES[modeKey] || WORD_DICTIONARIES.mode1;
    this.wordList = [...dict];

    this.exclusionManager.reset();

    this.words = [];
    this.lockedWord = null;
    this.bullets = [];
    this.particles = [];

    this.score = 0;
    this.health = 100;
    this.combo = 1;
    this.maxCombo = 1;
    this.wordsDestroyed = 0;
    this.totalKeystrokes = 0;
    this.correctKeystrokes = 0;
    this.startTime = Date.now();
    this.elapsedTime = 0;

    this.spawnTimer = 0;
    this.spawnInterval = 2200;
    this.baseWordSpeed = 0.7;

    this.shakeDuration = 0;
    this.shakeIntensity = 0;

    this.isRunning = true;
    this.isPaused = false;

    // Initial spawn
    this.spawnWord();

    this.lastFrameTime = performance.now();
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.loop = this.loop.bind(this);
    this.animFrameId = requestAnimationFrame(this.loop);
  }

  stop() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    if (this.isPaused) {
      this.isPaused = false;
      this.lastFrameTime = performance.now();
    }
  }

  /**
   * Spawn a new falling word
   */
  spawnWord() {
    if (this.wordList.length === 0) return;

    // Pick candidate word
    let candidates = [...this.wordList];
    let selectedWord = null;

    // Try up to 10 random attempts to find a non-excluded starting char
    for (let attempt = 0; attempt < 10; attempt++) {
      const idx = Math.floor(Math.random() * candidates.length);
      const wordStr = candidates[idx];
      if (!this.exclusionManager.isExcluded(wordStr)) {
        selectedWord = wordStr;
        break;
      }
    }

    if (!selectedWord) {
      selectedWord = candidates[Math.floor(Math.random() * candidates.length)];
    }

    const isBonus = Math.random() < this.bonusChance;
    if (isBonus) {
      this.exclusionManager.registerRedWord(selectedWord);
      sound.playBonusChime();
    }

    this.ctx.font = '16px "Share Tech Mono", monospace';
    const textMetrics = this.ctx.measureText(selectedWord);
    const wordWidth = textMetrics.width;

    const padding = 40;
    const minX = padding;
    const maxX = Math.max(padding, this.width - wordWidth - padding);
    const spawnX = minX + Math.random() * (maxX - minX);

    // Speed calculation with progressive difficulty
    const elapsedMinutes = (Date.now() - this.startTime) / 60000;
    const speedMultiplier = 1 + (elapsedMinutes * 0.15) + (this.wordsDestroyed * 0.015);
    const speed = (this.baseWordSpeed * speedMultiplier) * (isBonus ? 1.6 : 1.0);

    const wordObj = {
      id: Math.random().toString(36).substr(2, 9),
      text: selectedWord,
      typedCount: 0,
      isBonus,
      x: spawnX,
      y: 15,
      speed,
      width: wordWidth,
      height: 20
    };

    this.words.push(wordObj);
  }

  /**
   * Handles user keystroke input during gameplay
   */
  handleKeystroke(char) {
    if (!this.isRunning || this.isPaused) return;

    this.totalKeystrokes++;

    // 1. If no locked word, search all falling words using Lowest-First Priority
    if (!this.lockedWord) {
      let matchingWords = this.words.filter(w => w.text[0] === char);

      if (matchingWords.length > 0) {
        // Sort descending by Y (highest Y = lowest/bottom-most word on screen)
        matchingWords.sort((a, b) => b.y - a.y);
        this.lockedWord = matchingWords[0];
      }
    }

    // 2. Process keystroke against locked word
    if (this.lockedWord) {
      const expectedChar = this.lockedWord.text[this.lockedWord.typedCount];

      if (char === expectedChar) {
        // Correct Key!
        this.correctKeystrokes++;
        this.lockedWord.typedCount++;

        // Calculate target location for bullet tracer
        const charWidth = this.lockedWord.width / this.lockedWord.text.length;
        const targetX = this.lockedWord.x + (this.lockedWord.typedCount - 0.5) * charWidth;
        const targetY = this.lockedWord.y + 10;

        // Calculate turret angle to target
        const dx = targetX - this.tankX;
        const dy = targetY - this.tankY;
        this.targetTurretAngle = Math.atan2(dy, dx);
        this.turretAngle = this.targetTurretAngle;

        // Fire Bullet
        this.fireBullet(targetX, targetY);
        this.barrelRecoil = 8; // Barrel pushback
        sound.playLaser();

        // Increment Combo
        this.combo++;
        if (this.combo > this.maxCombo) {
          this.maxCombo = this.combo;
        }

        // Check if word completed
        if (this.lockedWord.typedCount >= this.lockedWord.text.length) {
          this.destroyWord(this.lockedWord, targetX, targetY);
          this.lockedWord = null;
        }
      } else {
        // Typo Error!
        sound.playError();
        this.combo = 1; // Reset combo multiplier on typo
        this.triggerShake(4, 150);
        // Error flash particle at target
        const targetX = this.lockedWord.x + (this.lockedWord.typedCount + 0.5) * (this.lockedWord.width / this.lockedWord.text.length);
        this.spawnParticleRing(targetX, this.lockedWord.y, '#ff3333');
      }
    } else {
      // Unmatched key
      sound.playError();
      this.combo = 1;
    }
  }

  fireBullet(targetX, targetY) {
    const barrelLen = 32;
    const startX = this.tankX + Math.cos(this.turretAngle) * barrelLen;
    const startY = this.tankY + Math.sin(this.turretAngle) * barrelLen;

    this.bullets.push({
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      targetX,
      targetY,
      progress: 0,
      speed: 0.15 // Fast bullet travel
    });

    // Muzzle Flash Particles
    for (let i = 0; i < 6; i++) {
      const pAngle = this.turretAngle + (Math.random() - 0.5) * 0.5;
      const pSpeed = 2 + Math.random() * 4;
      this.particles.push({
        x: startX,
        y: startY,
        vx: Math.cos(pAngle) * pSpeed,
        vy: Math.sin(pAngle) * pSpeed,
        color: '#ffff66',
        size: 2 + Math.random() * 2,
        alpha: 1.0,
        decay: 0.08
      });
    }
  }

  destroyWord(word, hitX, hitY) {
    this.wordsDestroyed++;
    const bonusMult = word.isBonus ? 3.5 : 1.0;
    const basePts = word.text.length * 15;
    const earnedScore = Math.round(basePts * this.combo * bonusMult);
    this.score += earnedScore;

    if (word.isBonus) {
      this.exclusionManager.resolveRedWord(word.text);
    }

    sound.playExplosion();

    // Explosion Particles
    const color = word.isBonus ? '#ff2244' : '#33ff33';
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 5;
      this.particles.push({
        x: hitX,
        y: hitY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: color,
        size: 2 + Math.random() * 3,
        alpha: 1.0,
        decay: 0.03 + Math.random() * 0.03
      });
    }

    // Floating Score Text Particle
    this.particles.push({
      isText: true,
      text: `+${earnedScore}${word.isBonus ? ' [3.5x]' : ''}`,
      x: hitX,
      y: hitY - 10,
      vx: 0,
      vy: -1.2,
      color: word.isBonus ? '#ffcc00' : '#66ff66',
      alpha: 1.0,
      decay: 0.02
    });

    // Remove word from list
    this.words = this.words.filter(w => w.id !== word.id);
  }

  triggerShake(intensity = 6, durationMs = 300) {
    this.shakeIntensity = intensity;
    this.shakeDuration = durationMs;
  }

  spawnParticleRing(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 / 10) * i;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * 3,
        vy: Math.sin(angle) * 3,
        color,
        size: 2,
        alpha: 1.0,
        decay: 0.05
      });
    }
  }

  // Main Loop
  loop(timestamp) {
    if (!this.isRunning) return;

    const dt = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;

    if (!this.isPaused) {
      this.update(dt);
    }
    this.render();

    this.animFrameId = requestAnimationFrame(this.loop);
  }

  update(dt) {
    this.elapsedTime = (Date.now() - this.startTime) / 1000;

    // 1. Spawning
    this.spawnTimer += dt;
    // Scale spawn rate over time
    const adjustedInterval = Math.max(900, this.spawnInterval - (this.wordsDestroyed * 25));
    if (this.spawnTimer >= adjustedInterval) {
      this.spawnTimer = 0;
      this.spawnWord();
    }

    // 2. Shake decay
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
      if (this.shakeDuration <= 0) {
        this.shakeIntensity = 0;
      }
    }

    // 3. Recoil recovery
    if (this.barrelRecoil > 0) {
      this.barrelRecoil -= 0.8;
      if (this.barrelRecoil < 0) this.barrelRecoil = 0;
    }

    // 4. Update Words & Check Perimeter Defense Line
    const perimeterY = this.height - 60;

    for (let i = this.words.length - 1; i >= 0; i--) {
      const w = this.words[i];
      w.y += w.speed;

      if (w.y >= perimeterY) {
        // Defense Breach!
        const damage = w.isBonus ? 30 : 20;
        this.health = Math.max(0, this.health - damage);
        sound.playDamage();
        this.triggerShake(12, 350);

        // Breach explosion
        this.spawnParticleRing(w.x + w.width / 2, perimeterY, '#ff2244');

        if (w.isBonus) {
          this.exclusionManager.resolveRedWord(w.text);
        }

        if (this.lockedWord && this.lockedWord.id === w.id) {
          this.lockedWord = null;
        }

        this.words.splice(i, 1);
        this.combo = 1; // Reset combo multiplier on breach

        if (this.health <= 0) {
          this.onTankDestroyed();
          return;
        }
      }
    }

    // 5. Update Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.progress += b.speed;
      b.currentX = b.startX + (b.targetX - b.startX) * b.progress;
      b.currentY = b.startY + (b.targetY - b.startY) * b.progress;

      if (b.progress >= 1.0) {
        // Bullet hit target
        this.spawnParticleRing(b.targetX, b.targetY, '#ffff66');
        this.bullets.splice(i, 1);
      }
    }

    // 6. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx || 0;
      p.y += p.vy || 0;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 7. Update HUD metrics
    if (this.hudCallbacks.onUpdate) {
      const wpm = this.elapsedTime > 0 ? Math.round((this.correctKeystrokes / 5) / (this.elapsedTime / 60)) : 0;
      const acc = this.totalKeystrokes > 0 ? Math.round((this.correctKeystrokes / this.totalKeystrokes) * 100) : 100;
      this.hudCallbacks.onUpdate({
        score: this.score,
        health: this.health,
        combo: this.combo,
        wpm,
        accuracy: acc
      });
    }
  }

  onTankDestroyed() {
    this.isRunning = false;
    sound.playDamage();
    
    // Massive Tank Explosion Particles
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8;
      this.particles.push({
        x: this.tankX,
        y: this.tankY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: i % 2 === 0 ? '#ff2244' : '#ffb700',
        size: 3 + Math.random() * 5,
        alpha: 1.0,
        decay: 0.02
      });
    }

    if (this.hudCallbacks.onGameOver) {
      setTimeout(() => {
        const wpm = this.elapsedTime > 0 ? Math.round((this.correctKeystrokes / 5) / (this.elapsedTime / 60)) : 0;
        const acc = this.totalKeystrokes > 0 ? Math.round((this.correctKeystrokes / this.totalKeystrokes) * 100) : 100;
        this.hudCallbacks.onGameOver({
          score: this.score,
          wpm,
          accuracy: acc,
          wordsDestroyed: this.wordsDestroyed,
          maxCombo: this.maxCombo,
          modeKey: this.modeKey
        });
      }, 900);
    }
  }

  render() {
    this.ctx.save();

    // Apply Screen Shake if active
    if (this.shakeIntensity > 0) {
      const offsetX = (Math.random() - 0.5) * this.shakeIntensity;
      const offsetY = (Math.random() - 0.5) * this.shakeIntensity;
      this.ctx.translate(offsetX, offsetY);
    }

    // Clear Canvas
    this.ctx.fillStyle = '#020502';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw Subtle Grid Lines (Arcade Radar Feel)
    this.drawRadarGrid();

    // Draw Defense Perimeter Line
    const perimeterY = this.height - 60;
    this.ctx.strokeStyle = '#ff2244';
    this.ctx.setLineDash([8, 6]);
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, perimeterY);
    this.ctx.lineTo(this.width, perimeterY);
    this.ctx.stroke();
    this.ctx.setLineDash([]); // Reset line dash

    // Defense Line Label
    this.ctx.fillStyle = 'rgba(255, 34, 68, 0.6)';
    this.ctx.font = '11px "Share Tech Mono", monospace';
    this.ctx.fillText('[ DEFENSE PERIMETER // DO NOT BREACH ]', 15, perimeterY - 6);

    // Draw Tank & Cannon
    this.drawTank();

    // Draw Falling Words
    this.drawWords();

    // Draw Bullets & Laser Tracers
    this.drawBullets();

    // Draw Particles
    this.drawParticles();

    this.ctx.restore();
  }

  drawRadarGrid() {
    this.ctx.strokeStyle = 'rgba(51, 255, 51, 0.05)';
    this.ctx.lineWidth = 1;

    const gridSize = 40;
    for (let x = 0; x < this.width; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.height; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
  }

  drawTank() {
    this.ctx.save();
    this.ctx.translate(this.tankX, this.tankY);

    // Tank Tread Base
    this.ctx.fillStyle = '#112211';
    this.ctx.strokeStyle = '#33ff33';
    this.ctx.lineWidth = 2;

    this.ctx.fillRect(-36, 10, 72, 16);
    this.ctx.strokeRect(-36, 10, 72, 16);

    // Tread Wheels
    for (let x = -28; x <= 28; x += 14) {
      this.ctx.beginPath();
      this.ctx.arc(x, 18, 4, 0, Math.PI * 2);
      this.ctx.fillStyle = '#33ff33';
      this.ctx.fill();
    }

    // Dome Armor Chassis (Semicircle)
    this.ctx.beginPath();
    this.ctx.arc(0, 10, 26, Math.PI, 0);
    this.ctx.fillStyle = '#061806';
    this.ctx.fill();
    this.ctx.strokeStyle = '#33ff33';
    this.ctx.stroke();

    // Recoil-offset Barrel
    this.ctx.save();
    this.ctx.rotate(this.turretAngle);

    const barrelLen = 32 - this.barrelRecoil;
    this.ctx.fillStyle = '#225522';
    this.ctx.strokeStyle = '#66ff66';
    this.ctx.lineWidth = 2;
    this.ctx.fillRect(0, -4, barrelLen, 8);
    this.ctx.strokeRect(0, -4, barrelLen, 8);

    // Cannon Muzzle Tip
    this.ctx.fillStyle = '#66ff66';
    this.ctx.fillRect(barrelLen - 4, -5, 6, 10);

    this.ctx.restore();

    // Turret Center Pivot Dome
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 10, 0, Math.PI * 2);
    this.ctx.fillStyle = '#33ff33';
    this.ctx.fill();

    this.ctx.restore();
  }

  drawWords() {
    this.ctx.font = '16px "Share Tech Mono", monospace';

    this.words.forEach(w => {
      const isLocked = this.lockedWord && this.lockedWord.id === w.id;

      this.ctx.save();

      // Word Box Background / Bracket
      if (isLocked) {
        this.ctx.fillStyle = 'rgba(51, 255, 51, 0.12)';
        this.ctx.strokeStyle = '#66ff66';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(w.x - 6, w.y - 14, w.width + 12, 22);
        this.ctx.fillRect(w.x - 6, w.y - 14, w.width + 12, 22);
      } else if (w.isBonus) {
        this.ctx.fillStyle = 'rgba(255, 34, 68, 0.15)';
        this.ctx.strokeStyle = '#ff2244';
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeRect(w.x - 4, w.y - 12, w.width + 8, 20);
        this.ctx.fillRect(w.x - 4, w.y - 12, w.width + 8, 20);
      }

      // Render Text Letters
      const chars = w.text.split('');
      let charX = w.x;

      chars.forEach((c, i) => {
        const cWidth = this.ctx.measureText(c).width;

        if (isLocked) {
          if (i < w.typedCount) {
            // Already Typed -> Fade to ~35-40% opacity
            this.ctx.fillStyle = 'rgba(51, 255, 51, 0.38)';
            this.ctx.fillText(c, charX, w.y);
          } else if (i === w.typedCount) {
            // Active Cursor Character -> Glowing Phosphor Yellow/Green
            this.ctx.fillStyle = '#ffff66';
            this.ctx.fillText(c, charX, w.y);

            // Active glowing cursor line underneath
            this.ctx.fillStyle = '#ffff66';
            this.ctx.fillRect(charX, w.y + 3, cWidth, 2);
          } else {
            // Remaining Untyped -> Bright Green
            this.ctx.fillStyle = '#66ff66';
            this.ctx.fillText(c, charX, w.y);
          }
        } else {
          // Unlocked Word Text Color
          this.ctx.fillStyle = w.isBonus ? '#ff3355' : '#33ff33';
          this.ctx.fillText(c, charX, w.y);
        }

        charX += cWidth;
      });

      // Bonus Badge indicator
      if (w.isBonus) {
        this.ctx.fillStyle = '#ff2244';
        this.ctx.font = '10px "Press Start 2P", monospace';
        this.ctx.fillText('3.5X', w.x + w.width + 10, w.y - 2);
      }

      this.ctx.restore();
    });
  }

  drawBullets() {
    this.ctx.save();
    this.bullets.forEach(b => {
      // Laser Tracer Line
      this.ctx.strokeStyle = '#ffff66';
      this.ctx.lineWidth = 2;
      this.ctx.shadowColor = '#ffff00';
      this.ctx.shadowBlur = 8;

      this.ctx.beginPath();
      this.ctx.moveTo(b.startX, b.startY);
      this.ctx.lineTo(b.currentX, b.currentY);
      this.ctx.stroke();
    });
    this.ctx.restore();
  }

  drawParticles() {
    this.particles.forEach(p => {
      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, p.alpha);

      if (p.isText) {
        this.ctx.font = '12px "Press Start 2P", monospace';
        this.ctx.fillStyle = p.color;
        this.ctx.fillText(p.text, p.x, p.y);
      } else {
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.restore();
    });
  }
}
