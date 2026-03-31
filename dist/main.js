const statusEl = document.querySelector("#status");
function setStatus(message, tone = "loading") {
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
const canvas = document.querySelector("#game");
if (!canvas) {
  throw new Error("Game canvas not found.");
}
const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("2D context not available.");
}
const controls = { left: false, right: false };
const width = canvas.width;
const height = canvas.height;
const topHudHeight = 42;
const bottomHudHeight = 40;
const playTop = topHudHeight;
const playBottom = height - bottomHudHeight;
const horizonY = 182;
const playerY = playBottom - 20;
const laneCenters = [-116, -56, 0, 56, 116];
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
let obstacles = [];
let nextSpawnZ = -0.18;
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function formatScore(value) {
  return Math.floor(value).toString().padStart(6, "0");
}
function perspectiveScale(z) {
  return 0.12 + Math.pow(z, 1.55) * 1.55;
}
function laneToScreenX(lane, z) {
  const perspective = 0.18 + Math.pow(z, 1.35) * 0.96;
  return width / 2 + lane * perspective;
}
function obstacleScreenY(z) {
  return horizonY + Math.pow(z, 1.7) * (playBottom - horizonY - 6);
}
function spawnRow(z, openingLane) {
  const lanes = laneCenters.filter((lane) => Math.abs(lane - openingLane) > 6);
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
function spawnAhead() {
  while (nextSpawnZ < 0.08) {
    const openingLane = laneCenters[Math.floor(Math.random() * laneCenters.length)];
    spawnRow(nextSpawnZ, openingLane);
    nextSpawnZ += 0.19 + Math.random() * 0.08;
  }
}
function resetGame(resetPenalty = true) {
  score = 0;
  if (resetPenalty) {
    continuePenalty = 0;
  }
  playerLane = 0;
  targetLane = 0;
  crashed = false;
  crashTimer = 0;
  roadScroll = 0;
  obstacles = [];
  nextSpawnZ = -1.1;
  spawnAhead();
}
function triggerCrash() {
  crashed = true;
  crashTimer = 1.1;
  continuePenalty += 1;
  hiScore = Math.max(hiScore, Math.floor(score));
  setStatus("Crash! Press Space to continue.", "error");
}
function obstacleAtPlayerPlane(obstacle) {
  return obstacle.z > playerPlaneZ - 0.035 && obstacle.z < playerPlaneZ + 0.06;
}
function update(delta) {
  roadScroll += delta * 0.8;
  if (crashed) {
    crashTimer = Math.max(0, crashTimer - delta);
    return;
  }
  score += delta * 850;
  hiScore = Math.max(hiScore, Math.floor(score));
  if (controls.left) {
    targetLane -= delta * 170;
  }
  if (controls.right) {
    targetLane += delta * 170;
  }
  targetLane = clamp(targetLane, laneCenters[0], laneCenters[laneCenters.length - 1]);
  playerLane += (targetLane - playerLane) * Math.min(1, delta * 10);
  const speed = 0.56 + Math.min(score / 4e4, 0.55);
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
function drawHudBar(y, h) {
  ctx.fillStyle = "#14a7ab";
  ctx.fillRect(0, y, width, h);
}
function drawPlayfield() {
  ctx.fillStyle = "#1f9ae6";
  ctx.fillRect(0, playTop, width, horizonY - playTop);
  ctx.fillStyle = "#04d83d";
  ctx.fillRect(0, horizonY, width, playBottom - horizonY);
}
function drawGroundLines() {
  ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i += 1) {
    const z = (roadScroll * 0.75 + i * 0.16) % 1;
    const y = obstacleScreenY(z);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}
function drawObstacle(obstacle) {
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
function drawObstacleForeground(obstacle) {
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
function drawPlayer() {
  const x = width / 2 + playerLane;
  const y = playerY;
  const offset = (targetLane - playerLane) * 0.08;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(offset);
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
function drawHudText() {
  ctx.fillStyle = "#d9fff9";
  ctx.font = "400 14px Trebuchet MS";
  ctx.fillText("Score:", 42, 25);
  ctx.fillText(formatScore(score), 110, 25);
  ctx.fillText("Continue penalty:", 196, 25);
  ctx.fillText(String(continuePenalty), 368, 25);
  ctx.fillText(`Your Hi-score:${hiScore}`, 2, height - 12);
}
function drawOverlay() {
  if (!crashed && score > 3) {
    return;
  }
  ctx.fillStyle = "rgba(20, 167, 171, 0.16)";
  ctx.fillRect(0, playTop, width, playBottom - playTop);
  ctx.fillStyle = "#ffffff";
  ctx.font = "400 16px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(crashed ? "Press Space to continue" : "Use left and right to slalom", width / 2, 90);
  ctx.textAlign = "start";
}
function render() {
  ctx.clearRect(0, 0, width, height);
  drawHudBar(0, topHudHeight);
  drawPlayfield();
  drawGroundLines();
  const sortedObstacles = obstacles.slice().sort((a, b) => a.z - b.z);
  const backgroundObstacles = sortedObstacles.filter((obstacle) => obstacle.z < playerPlaneZ);
  const foregroundObstacles = sortedObstacles.filter((obstacle) => obstacle.z >= playerPlaneZ);
  backgroundObstacles.forEach(drawObstacle);
  drawPlayer();
  foregroundObstacles.forEach(drawObstacleForeground);
  drawHudBar(playBottom, bottomHudHeight);
  drawHudText();
  drawOverlay();
}
function loop(timestamp) {
  const delta = clamp((timestamp - previousTime) / 1e3, 1e-3, 0.03);
  previousTime = timestamp;
  update(delta);
  render();
  requestAnimationFrame(loop);
}
function setKey(code, pressed) {
  if (code === "ArrowLeft" || code === "KeyA") {
    controls.left = pressed;
  }
  if (code === "ArrowRight" || code === "KeyD") {
    controls.right = pressed;
  }
  if (pressed && code === "Space" && crashed) {
    resetGame(false);
    setStatus("Game live. Classic mode.", "ready");
  }
}
window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  setKey(event.code, true);
});
window.addEventListener("keyup", (event) => {
  setKey(event.code, false);
});
resetGame();
render();
setStatus("Game live. Classic mode.", "ready");
window.setTimeout(() => {
  var _a;
  if ((_a = statusEl == null ? void 0 : statusEl.classList) == null ? void 0 : _a.contains("is-ready")) {
    statusEl.style.display = "none";
  }
}, 1400);
requestAnimationFrame((time) => {
  previousTime = time;
  loop(time);
});
