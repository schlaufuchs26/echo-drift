const GRID_SIZE = 4;
const CANVAS_SIZE = 400;
const CELL_SIZE = CANVAS_SIZE / GRID_SIZE;

const COLORS = [
  '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF',
  '#FF8E8E', '#FFE66D', '#95E1D3', '#AA96DA',
  '#F08A5D', '#B83B5E', '#6A2C70', '#08D9D6',
  '#FF2E63', '#EA5455', '#2D4059', '#F07B3F',
];

const FREQUENCIES = [
  261.63, 293.66, 329.63, 349.23,
  392.00, 440.00, 493.88, 523.25,
  587.33, 659.25, 698.46, 783.99,
  880.00, 987.77, 1046.50, 1174.66,
];

const DRIFT_NAMES = ['⬆ UP', '⬇ DOWN', '⬅ LEFT', '➡ RIGHT'];
const DRIFT_DIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

type GamePhase = 'menu' | 'memorize' | 'drift' | 'recall' | 'result';

class EchoDrift {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private phase: GamePhase = 'menu';
  private activeCells: [number, number][] = [];
  private activeColors: string[] = [];
  private driftDx = 0;
  private driftDy = 0;
  private driftName = '';
  private round = 1;
  private score = 0;
  private selectedCells: [number, number][] = [];
  private resultCells = new Map<string, boolean>();
  private audioCtx: AudioContext | null = null;
  private highScore = 0;
  private comboCount = 0;
  private animFrame = 0;
  private driftProgress = 0;

  constructor() {
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    this.canvas.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const t = e.touches[0];
        const r = this.canvas.getBoundingClientRect();
        this.handleInput((t.clientX - r.left) * (CANVAS_SIZE / r.width), (t.clientY - r.top) * (CANVAS_SIZE / r.height));
      },
      { passive: false },
    );
    this.loadHighScore();
    this.animate();
  }

  private loadHighScore(): void {
    try {
      this.highScore = parseInt(localStorage.getItem('echoDriftHigh') || '0', 10);
    } catch {
      /* noop */
    }
  }

  private saveHighScore(): void {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      try {
        localStorage.setItem('echoDriftHigh', String(this.highScore));
      } catch {
        /* noop */
      }
    }
  }

  private playTone(index: number): void {
    try {
      if (!this.audioCtx) this.audioCtx = new AudioContext();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.frequency.value = FREQUENCIES[index % FREQUENCIES.length];
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.25, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.4);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.4);
    } catch {
      /* audio may not be available */
    }
  }

  private startGame(): void {
    this.round = 1;
    this.score = 0;
    this.comboCount = 0;
    this.startRound();
  }

  private startRound(): void {
    const numActive = Math.min(2 + Math.floor((this.round - 1) / 2), 8);
    this.activeCells = [];
    this.activeColors = [];
    this.selectedCells = [];
    this.resultCells = new Map();

    const allCells: [number, number][] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) allCells.push([x, y]);
    }
    for (let i = allCells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allCells[i], allCells[j]] = [allCells[j], allCells[i]];
    }

    for (let i = 0; i < numActive; i++) {
      this.activeCells.push(allCells[i]);
      const ci = allCells[i][0] * GRID_SIZE + allCells[i][1];
      this.activeColors.push(COLORS[ci % COLORS.length]);
    }

    const di = Math.floor(Math.random() * DRIFT_DIRS.length);
    this.driftDx = DRIFT_DIRS[di][0];
    this.driftDy = DRIFT_DIRS[di][1];
    this.driftName = DRIFT_NAMES[di];
    this.driftProgress = 0;

    this.phase = 'memorize';

    for (let i = 0; i < this.activeCells.length; i++) {
      const [x, y] = this.activeCells[i];
      setTimeout(() => this.playTone(x * GRID_SIZE + y), i * 200);
    }

    const memoTimer = Math.max(1500, 4000 - this.round * 200);
    setTimeout(() => {
      this.phase = 'drift';
      this.driftProgress = 0;
    }, memoTimer);
  }

  private handleClick(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.handleInput((e.clientX - r.left) * (CANVAS_SIZE / r.width), (e.clientY - r.top) * (CANVAS_SIZE / r.height));
  }

  private handleInput(px: number, py: number): void {
    if (this.phase === 'menu') {
      if (px > 120 && px < 280 && py > 230 && py < 280) {
        this.startGame();
      }
      return;
    }

    if (this.phase === 'recall') {
      const gx = Math.floor(px / CELL_SIZE);
      const gy = Math.floor(py / CELL_SIZE);
      if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) return;
      if (this.selectedCells.some(([x, y]) => x === gx && y === gy)) return;

      this.selectedCells.push([gx, gy]);

      const drifted = this.activeCells.map(([x, y]): [number, number] => [
        ((x + this.driftDx) % GRID_SIZE + GRID_SIZE) % GRID_SIZE,
        ((y + this.driftDy) % GRID_SIZE + GRID_SIZE) % GRID_SIZE,
      ]);

      const isCorrect = drifted.some(([x, y]) => x === gx && y === gy);
      this.resultCells.set(`${gx},${gy}`, isCorrect);

      if (isCorrect) {
        this.comboCount++;
        this.score += 10 + this.comboCount * 2;
        this.playTone(gx * GRID_SIZE + gy);
      } else {
        this.comboCount = 0;
        this.score = Math.max(0, this.score - 5);
      }

      const foundCorrect = this.selectedCells.filter(([sx, sy]) => drifted.some(([dx, dy]) => dx === sx && dy === sy)).length;
      if (foundCorrect >= drifted.length || this.selectedCells.length >= drifted.length + 3) {
        setTimeout(() => {
          this.saveHighScore();
          this.phase = 'result';
        }, 600);
      }
    }

    if (this.phase === 'result') {
      if (px > 120 && px < 280 && py > 330 && py < 370) {
        this.round++;
        this.startRound();
      }
    }
  }

  private drawGrid(showActive: boolean, ox = 0, oy = 0): void {
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        const dx = x * CELL_SIZE + ox + 2;
        const dy = y * CELL_SIZE + oy + 2;
        const w = CELL_SIZE - 4;

        const isActive = showActive && this.activeCells.some(([ax, ay]) => ax === x && ay === y);

        this.ctx.fillStyle = isActive ? '#2a2a4e' : '#12121f';
        this.ctx.fillRect(dx, dy, w, w);
        this.ctx.strokeStyle = isActive ? '#5a5a8e' : '#1e1e38';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(dx, dy, w, w);

        if (isActive) {
          const idx = this.activeCells.findIndex(([ax, ay]) => ax === x && ay === y);
          if (idx >= 0) {
            this.ctx.fillStyle = this.activeColors[idx];
            this.ctx.globalAlpha = 0.45;
            this.ctx.fillRect(dx + 2, dy + 2, w - 4, w - 4);
            this.ctx.globalAlpha = 1;
          }
        }
      }
    }
  }

  private drawMenu(): void {
    this.ctx.fillStyle = '#0a0a1a';
    this.ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw drifting demo cells
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        const dx = x * CELL_SIZE + 2;
        const dy = y * CELL_SIZE + 2;
        const w = CELL_SIZE - 4;
        this.ctx.fillStyle = '#12121f';
        this.ctx.fillRect(dx, dy, w, w);
        this.ctx.strokeStyle = '#1e1e38';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(dx, dy, w, w);
      }
    }

    // Animated drift demo cells
    const demoIdx = Math.floor(this.animFrame / 30) % this.activeCells.length;
    if (this.activeCells.length > 0 && demoIdx < this.activeCells.length) {
      const [cx, cy] = this.activeCells[demoIdx];
      const driftX = Math.sin(this.animFrame * 0.02) * 10;
      const driftY = Math.cos(this.animFrame * 0.02) * 10;
      this.ctx.fillStyle = this.activeColors[demoIdx % this.activeColors.length] || '#4D96FF';
      this.ctx.globalAlpha = 0.3;
      this.ctx.fillRect(cx * CELL_SIZE + 6 + driftX, cy * CELL_SIZE + 6 + driftY, CELL_SIZE - 12, CELL_SIZE - 12);
      this.ctx.globalAlpha = 1;
    }

    // Title
    this.ctx.fillStyle = '#d0d0ff';
    this.ctx.font = 'bold 34px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('ECHO DRIFT', CANVAS_SIZE / 2, 80);

    // Tagline
    this.ctx.fillStyle = '#6666aa';
    this.ctx.font = '13px monospace';
    this.ctx.fillText('⏳ memorize → 🌊 drift → 🎯 recall', CANVAS_SIZE / 2, 108);

    // Instructions
    this.ctx.fillStyle = '#555599';
    this.ctx.font = '11px monospace';
    this.ctx.fillText('Cells light up in color. Memorize them.', CANVAS_SIZE / 2, 155);
    this.ctx.fillText('The grid drifts. Click where they moved.', CANVAS_SIZE / 2, 172);
    this.ctx.fillText('Correct: +10·combo  |  Wrong: -5', CANVAS_SIZE / 2, 189);

    // Start button
    this.ctx.fillStyle = '#2a2a5c';
    this.ctx.fillRect(120, 230, 160, 50);
    this.ctx.strokeStyle = '#5a5aac';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(120, 230, 160, 50);
    this.ctx.fillStyle = '#d0d0ff';
    this.ctx.font = 'bold 18px monospace';
    this.ctx.fillText('▶ START', CANVAS_SIZE / 2, 262);

    if (this.highScore > 0) {
      this.ctx.fillStyle = '#ffd700';
      this.ctx.font = '14px monospace';
      this.ctx.fillText(`🏆 Best: ${this.highScore}`, CANVAS_SIZE / 2, 320);
    }
  }

  private drawMemorize(): void {
    this.ctx.fillStyle = '#0a0a1a';
    this.ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    this.drawGrid(true);

    this.ctx.fillStyle = '#8888cc';
    this.ctx.font = '12px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`✦ MEMORIZE ✦  Round ${this.round}`, CANVAS_SIZE / 2, CANVAS_SIZE - 15);
    this.ctx.fillText(`${this.activeCells.length} cell${this.activeCells.length > 1 ? 's' : ''}`, CANVAS_SIZE / 2, CANVAS_SIZE - 32);
  }

  private drawDrift(): void {
    this.ctx.fillStyle = '#0a0a1a';
    this.ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    this.driftProgress = Math.min(1, this.driftProgress + 0.03);
    const prog = this.driftProgress;
    const sx = this.driftDx * CELL_SIZE * prog;
    const sy = this.driftDy * CELL_SIZE * prog;

    // Wrap-draw: draw grid twice so cells wrap around
    this.drawGrid(false, sx, sy);
    this.drawGrid(false, sx - Math.sign(this.driftDx) * CANVAS_SIZE, sy - Math.sign(this.driftDy) * CANVAS_SIZE);

    this.ctx.fillStyle = '#ffd700';
    this.ctx.font = 'bold 20px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`🌊 ${this.driftName}`, CANVAS_SIZE / 2, 28);

    if (this.driftProgress >= 1) {
      this.phase = 'recall';
    }
  }

  private drawRecall(): void {
    this.ctx.fillStyle = '#0a0a1a';
    this.ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    this.drawGrid(false);

    const drifted = this.activeCells.map(([x, y]): [number, number] => [
      ((x + this.driftDx) % GRID_SIZE + GRID_SIZE) % GRID_SIZE,
      ((y + this.driftDy) % GRID_SIZE + GRID_SIZE) % GRID_SIZE,
    ]);

    for (const [gx, gy] of this.selectedCells) {
      const x = gx * CELL_SIZE;
      const y = gy * CELL_SIZE;
      const key = `${gx},${gy}`;
      const correct = this.resultCells.get(key);

      if (correct === true) {
        const idx = drifted.findIndex(([dx, dy]) => dx === gx && dy === gy);
        if (idx >= 0) {
          this.ctx.fillStyle = this.activeColors[idx];
          this.ctx.globalAlpha = 0.6;
          this.ctx.fillRect(x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8);
          this.ctx.globalAlpha = 1;
        }
        this.ctx.strokeStyle = '#44dd44';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
      } else if (correct === false) {
        this.ctx.fillStyle = 'rgba(200,40,40,0.35)';
        this.ctx.fillRect(x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8);
        this.ctx.strokeStyle = '#dd4444';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
      }
    }

    this.ctx.fillStyle = '#8888cc';
    this.ctx.font = '12px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`Click where cells drifted →`, CANVAS_SIZE / 2, CANVAS_SIZE - 15);
  }

  private drawResult(): void {
    this.ctx.fillStyle = '#0a0a1a';
    this.ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    this.drawGrid(false);

    const drifted = this.activeCells.map(([x, y]): [number, number] => [
      ((x + this.driftDx) % GRID_SIZE + GRID_SIZE) % GRID_SIZE,
      ((y + this.driftDy) % GRID_SIZE + GRID_SIZE) % GRID_SIZE,
    ]);

    for (let i = 0; i < this.activeCells.length; i++) {
      const [ox, oy] = this.activeCells[i];
      const gx = ((ox + this.driftDx) % GRID_SIZE + GRID_SIZE) % GRID_SIZE;
      const gy = ((oy + this.driftDy) % GRID_SIZE + GRID_SIZE) % GRID_SIZE;

      // Ghost at original
      this.ctx.fillStyle = this.activeColors[i];
      this.ctx.globalAlpha = 0.12;
      this.ctx.fillRect(ox * CELL_SIZE + 4, oy * CELL_SIZE + 4, CELL_SIZE - 8, CELL_SIZE - 8);

      // Arrow from original to drifted
      this.ctx.strokeStyle = this.activeColors[i];
      this.ctx.globalAlpha = 0.25;
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(ox * CELL_SIZE + CELL_SIZE / 2, oy * CELL_SIZE + CELL_SIZE / 2);
      this.ctx.lineTo(gx * CELL_SIZE + CELL_SIZE / 2, gy * CELL_SIZE + CELL_SIZE / 2);
      this.ctx.stroke();

      // Solid at drifted
      this.ctx.fillStyle = this.activeColors[i];
      this.ctx.globalAlpha = 0.7;
      this.ctx.fillRect(gx * CELL_SIZE + 4, gy * CELL_SIZE + 4, CELL_SIZE - 8, CELL_SIZE - 8);
      this.ctx.globalAlpha = 1;
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(gx * CELL_SIZE + 2, gy * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
    }

    this.ctx.fillStyle = '#d0d0ff';
    this.ctx.font = 'bold 22px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`Score: ${this.score}`, CANVAS_SIZE / 2, CANVAS_SIZE - 90);

    this.ctx.fillStyle = '#8888cc';
    this.ctx.font = '13px monospace';
    const correctCount = this.selectedCells.filter(([sx, sy]) => drifted.some(([dx, dy]) => dx === sx && dy === sy)).length;
    this.ctx.fillText(`Round ${this.round}: ${correctCount}/${drifted.length} correct`, CANVAS_SIZE / 2, CANVAS_SIZE - 67);

    if (this.score > this.highScore) {
      this.ctx.fillStyle = '#ffd700';
      this.ctx.font = 'bold 13px monospace';
      this.ctx.fillText('★ NEW HIGH SCORE ★', CANVAS_SIZE / 2, CANVAS_SIZE - 47);
    }

    // Next button
    this.ctx.fillStyle = '#2a2a5c';
    this.ctx.fillRect(120, CANVAS_SIZE - 40, 160, 36);
    this.ctx.strokeStyle = '#5a5aac';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(120, CANVAS_SIZE - 40, 160, 36);
    this.ctx.fillStyle = '#d0d0ff';
    this.ctx.font = 'bold 14px monospace';
    this.ctx.fillText('NEXT →', CANVAS_SIZE / 2, CANVAS_SIZE - 18);
  }

  private animate = (): void => {
    this.animFrame++;
    this.ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    switch (this.phase) {
      case 'menu':
        this.drawMenu();
        break;
      case 'memorize':
        this.drawMemorize();
        break;
      case 'drift':
        this.drawDrift();
        break;
      case 'recall':
        this.drawRecall();
        break;
      case 'result':
        this.drawResult();
        break;
    }

    // HUD overlay
    if (this.phase !== 'menu') {
      this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
      this.ctx.font = '11px monospace';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(`❤ ${this.score}`, 8, 14);
      this.ctx.textAlign = 'right';
      this.ctx.fillText(`R${this.round}`, CANVAS_SIZE - 8, 14);
    }

    requestAnimationFrame(this.animate);
  };
}

window.addEventListener('DOMContentLoaded', () => {
  new EchoDrift();
});