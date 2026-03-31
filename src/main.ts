const statusEl = document.querySelector<HTMLElement>("#status");

function setStatus(message: string, tone: "loading" | "ready" | "error" = "loading"): void {
  if (!statusEl) {
    return;
  }

  statusEl.textContent = message;
  statusEl.className = "status";
  if (tone === "ready") {
    statusEl.classList.add("is-ready");
  }
  if (tone === "error") {
    statusEl.classList.add("is-error");
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const gameCard = document.querySelector<HTMLElement>(".game-card");

if (!canvas) {
  throw new Error("Game canvas not found.");
}

const ctx = canvas.getContext("2d");

if (!ctx) {
  throw new Error("2D context not available.");
}

type Controls = {
  left: boolean;
  right: boolean;
};

type Obstacle = {
  lane: number;
  z: number;
  width: number;
  height: number;
  color: string;
};

const controls: Controls = { left: false, right: false };
const width = canvas.width;
const height = canvas.height;
const topHudHeight = 42;
const bottomHudHeight = 40;
const playTop = topHudHeight;
const playBottom = height - bottomHudHeight;
const horizonY = 182;
const playerY = playBottom - 20;
const obstacleColors = ["#8f6b1d", "#7d560f", "#666666", "#8a8a8a"];
const playerPlaneZ = 0.83;

let score = 0;
let hiScore = 6960;
let continuePenalty = 0;
let playerLane = 0;
let targetLane = 0;
let previousTime = 0;
let crashed = false;
let crashTimer = 0;
let roadScroll = 0;
let obstacles: Obstacle[] = [];
let nextSpawnZ = -0.18;
let pendingContinue = false;
let bankAngle = 0;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatScore(value: number): string {
  return Math.floor(value).toString().padStart(6, "0");
}

function perspectiveScale(z: number): number {
  return 0.12 + Math.pow(z, 1.55) * 1.55;
}

function laneToScreenX(lane: number, z: number): number {
  const perspective = 0.18 + Math.pow(z, 1.35) * 0.96;
  return width / 2 + (lane - playerLane) * perspective;
}

function obstacleScreenY(z: number): number {
  return horizonY + Math.pow(z, 1.7) * (playBottom - horizonY - 6);
}

function spawnRow(z: number, openingLane: number): void {
  const candidateOffsets = [-180, -130, -80, -30, 20, 70, 120, 170];
  const candidateLanes = candidateOffsets.map((offset) => playerLane + offset);
  const lanes = candidateLanes.filter((lane) => Math.abs(lane - openingLane) > 32);
  const rowCount = Math.random() > 0.7 ? 3 : 2;
  const chosen = lanes.sort(() => Math.random() - 0.5).slice(0, rowCount);

  chosen.forEach((lane, index) => {
    const tall = Math.random() > 0.78;
    obstacles.push({
      lane,
      z: z - index * 0.012,
      width: tall ? 24 : 18,
      height: tall ? 88 : 44,
      color: obstacleColors[Math.floor(Math.random() * obstacleColors.length)]
    });
  });
}

function spawnAhead(): void {
  while (nextSpawnZ < 0.08) {
    const openingLane = playerLane - 120 + Math.random() * 240;
    spawnRow(nextSpawnZ, openingLane);
    nextSpawnZ += 0.19 + Math.random() * 0.08;
  }
}

function resetGame(resetPenalty = true): void {
  score = 0;
  if (resetPenalty) {
    continuePenalty = 0;
  }
  playerLane = 0;
  targetLane = 0;
  crashed = false;
  crashTimer = 0;
  roadScroll = 0;
  bankAngle = 0;
  obstacles = [];
  nextSpawnZ = -1.1;
  spawnAhead();
}

function triggerCrash(): void {
  crashed = true;
  crashTimer = 1.1;
  continuePenalty += 1;
  hiScore = Math.max(hiScore, Math.floor(score));
  setStatus("Crash! Press Space to continue.", "error");
}

function continueGame(): void {
  pendingContinue = true;
}

function obstacleAtPlayerPlane(obstacle: Obstacle): boolean {
  return obstacle.z > playerPlaneZ - 0.035 && obstacle.z < playerPlaneZ + 0.06;
}

function update(delta: number): void {
  roadScroll += delta * 0.8;

  if (crashed) {
    if (pendingContinue) {
      resetGame(false);
      pendingContinue = false;
      setStatus("Game live. Classic mode.", "ready");
      return;
    }
    crashTimer = Math.max(0, crashTimer - delta);
    return;
  }

  score += delta * 850;
  hiScore = Math.max(hiScore, Math.floor(score));

  const steeringInput = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  const targetBankAngle = steeringInput * -0.15;
  bankAngle += (targetBankAngle - bankAngle) * Math.min(1, delta * 9);

  if (controls.left) {
    targetLane -= delta * 170;
  }
  if (controls.right) {
    targetLane += delta * 170;
  }

  playerLane += (targetLane - playerLane) * Math.min(1, delta * 10);

  const speed = 0.56 + Math.min(score / 40000, 0.55);
  for (const obstacle of obstacles) {
    obstacle.z += delta * speed;
  }

  obstacles = obstacles.filter((obstacle) => obstacle.z < 1.08);
  nextSpawnZ -= delta * speed;
  spawnAhead();

  for (const obstacle of obstacles) {
    if (obstacleAtPlayerPlane(obstacle)) {
      const proximity = Math.abs(playerLane - obstacle.lane);
      const threshold = 16 + obstacle.width * 0.24;
      if (proximity < threshold) {
        triggerCrash();
        break;
      }
    }
  }
}

function drawHudBar(y: number, h: number): void {
  ctx.fillStyle = "#14a7ab";
  ctx.fillRect(0, y, width, h);
}

function drawPlayfield(): void {
  const pad = 160;
  ctx.fillStyle = "#1f9ae6";
  ctx.fillRect(-pad, playTop - pad, width + pad * 2, horizonY - playTop + pad);

  ctx.fillStyle = "#04d83d";
  ctx.fillRect(-pad, horizonY, width + pad * 2, playBottom - horizonY + pad);
}

function drawGroundLines(): void {
  ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i += 1) {
    const z = ((roadScroll * 0.75 + i * 0.16) % 1);
    const y = obstacleScreenY(z);
    ctx.beginPath();
    ctx.moveTo(-180, y);
    ctx.lineTo(width + 180, y);
    ctx.stroke();
  }
}

function drawObstacle(obstacle: Obstacle): void {
  const scale = perspectiveScale(clamp(obstacle.z, 0, 1));
  const x = laneToScreenX(obstacle.lane, clamp(obstacle.z, 0, 1));
  const y = obstacleScreenY(clamp(obstacle.z, 0, 1));
  const baseWidth = obstacle.width * scale;
  const objectHeight = obstacle.height * scale;

  ctx.fillStyle = obstacle.color;
  ctx.beginPath();
  ctx.moveTo(x, y - objectHeight);
  ctx.lineTo(x + baseWidth * 0.45, y);
  ctx.lineTo(x - baseWidth * 0.45, y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.beginPath();
  ctx.ellipse(x + baseWidth * 0.08, y + 2, baseWidth * 0.36, baseWidth * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawObstacleForeground(obstacle: Obstacle): void {
  const scale = perspectiveScale(clamp(obstacle.z, 0, 1));
  const x = laneToScreenX(obstacle.lane, clamp(obstacle.z, 0, 1));
  const y = obstacleScreenY(clamp(obstacle.z, 0, 1));
  const baseWidth = obstacle.width * scale;
  const objectHeight = obstacle.height * scale;

  ctx.fillStyle = obstacle.color;
  ctx.beginPath();
  ctx.moveTo(x, y - objectHeight);
  ctx.lineTo(x + baseWidth * 0.45, y);
  ctx.lineTo(x - baseWidth * 0.45, y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
  ctx.fillRect(x - baseWidth * 0.5, y, baseWidth, Math.max(4, scale * 3));
}

function drawPlayer(): void {
  const x = width / 2;
  const y = playerY;

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = "#112c88";
  ctx.fillRect(-58, -5, 116, 10);
  ctx.fillRect(-42, -12, 84, 8);
  ctx.fillRect(-18, -18, 36, 9);

  ctx.fillStyle = "#0b1a51";
  ctx.fillRect(-62, -2, 10, 7);
  ctx.fillRect(52, -2, 10, 7);

  ctx.fillStyle = "#5fd7ff";
  ctx.fillRect(-11, -16, 22, 8);

  ctx.fillStyle = "#f6f7fb";
  ctx.fillRect(-24, -9, 7, 7);
  ctx.fillRect(17, -9, 7, 7);

  ctx.fillStyle = "#ffd800";
  ctx.fillRect(-2, -2, 8, 7);
  ctx.fillRect(-18, -1, 7, 6);
  ctx.fillRect(11, -1, 7, 6);

  ctx.fillStyle = "#d4162b";
  ctx.fillRect(-32, -8, 6, 4);
  ctx.fillRect(26, -8, 6, 4);

  ctx.fillStyle = "#111111";
  ctx.fillRect(-50, 2, 14, 4);
  ctx.fillRect(36, 2, 14, 4);

  ctx.restore();
}

function drawHudText(): void {
  ctx.fillStyle = "#d9fff9";
  ctx.font = "400 14px Trebuchet MS";
  ctx.fillText("Score:", 42, 25);
  ctx.fillText(formatScore(score), 110, 25);
  ctx.fillText("Continue penalty:", 196, 25);
  ctx.fillText(String(continuePenalty), 368, 25);

  ctx.fillText(`Your Hi-score:${hiScore}`, 2, height - 12);
}

function drawOverlay(): void {
  if (!crashed && score > 3) {
    return;
  }

  ctx.fillStyle = "rgba(20, 167, 171, 0.16)";
  ctx.fillRect(0, playTop, width, playBottom - playTop);
  ctx.fillStyle = "#ffffff";
  ctx.font = "400 16px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(crashed ? "Press Space to continue" : "Use left and right to slalom [build 6]", width / 2, 90);
  ctx.textAlign = "start";
}

function drawWorld(): void {
  drawPlayfield();
  drawGroundLines();
  const sortedObstacles = obstacles.slice().sort((a, b) => a.z - b.z);
  const backgroundObstacles = sortedObstacles.filter((obstacle) => obstacle.z < playerPlaneZ);
  const foregroundObstacles = sortedObstacles.filter((obstacle) => obstacle.z >= playerPlaneZ);

  backgroundObstacles.forEach(drawObstacle);
  foregroundObstacles.forEach(drawObstacleForeground);
}

function render(): void {
  ctx.clearRect(0, 0, width, height);
  drawHudBar(0, topHudHeight);
  const playfieldCenterY = playTop + (playBottom - playTop) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, playTop, width, playBottom - playTop);
  ctx.clip();
  ctx.translate(width / 2, playfieldCenterY);
  ctx.rotate(bankAngle);
  ctx.translate(bankAngle * 46, 0);
  ctx.translate(-width / 2, -playfieldCenterY);
  drawWorld();
  ctx.restore();
  drawPlayer();
  drawHudBar(playBottom, bottomHudHeight);
  drawHudText();
  drawOverlay();
}

function loop(timestamp: number): void {
  const delta = clamp((timestamp - previousTime) / 1000, 0.001, 0.03);
  previousTime = timestamp;
  update(delta);
  render();
  requestAnimationFrame(loop);
}

function shouldContinue(code: string, key: string): boolean {
  return code === "Space" || code === "Enter" || key === " " || key === "Spacebar" || key === "Enter";
}

function setKey(code: string, key: string, pressed: boolean): void {
  if (code === "ArrowLeft" || code === "KeyA" || key === "ArrowLeft" || key === "a" || key === "A") {
    controls.left = pressed;
  }
  if (code === "ArrowRight" || code === "KeyD" || key === "ArrowRight" || key === "d" || key === "D") {
    controls.right = pressed;
  }
  if (pressed && crashed && shouldContinue(code, key)) {
    continueGame();
  }
}

window.addEventListener("keydown", (event) => {
  if (crashed && shouldContinue(event.code, event.key)) {
    event.preventDefault();
    continueGame();
    return;
  }

  if (["ArrowLeft", "ArrowRight", "Space", "Enter"].includes(event.code) || [" ", "Spacebar", "Enter"].includes(event.key)) {
    event.preventDefault();
  }
  setKey(event.code, event.key, true);
});

window.addEventListener("keyup", (event) => {
  setKey(event.code, event.key, false);
});

canvas.addEventListener("pointerdown", () => {
  if (crashed) {
    continueGame();
  }
});

gameCard?.addEventListener("pointerdown", () => {
  if (crashed) {
    continueGame();
  }
});

resetGame();
render();
setStatus("Game live. Classic mode.", "ready");
window.setTimeout(() => {
  if (statusEl?.classList.contains("is-ready")) {
    statusEl.style.display = "none";
  }
}, 1400);

requestAnimationFrame((time) => {
  previousTime = time;
  loop(time);
});
