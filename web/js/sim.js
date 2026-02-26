function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rollDisasterSeverity() {
  const r = Math.random() * 100;
  if (r < 60) return { label: "軽度", yieldPenalty: -10, popDamage: 0 };
  if (r < 90) return { label: "中度", yieldPenalty: -25, popDamage: 0 };
  return { label: "重度", yieldPenalty: -40, popDamage: -1 };
}

function initSimulator() {
  function runPlaytestTurn() {
    const terrainDifficulty = clamp(Number(document.getElementById("terrainDifficulty").value) || 1, 1, 5);
    const developmentPower = Math.max(1, Number(document.getElementById("developmentPower").value) || 10);
    const participants = clamp(Number(document.getElementById("participants").value) || 1, 1, 4);
    const currentProgress = clamp(Number(document.getElementById("currentProgress").value) || 0, 0, 100);
    const govBonus = Number(document.getElementById("govBonus").value) || 0;
    const facilityBonus = Number(document.getElementById("facilityBonus").value) || 0;
    const policyBonus = Number(document.getElementById("policyBonus").value) || 0;
    const monsterRisk = clamp(Number(document.getElementById("monsterRisk").value) || 0, 0, 100);
    const foodBalance = Number(document.getElementById("foodBalance").value);
    const dissatisfaction = clamp(Number(document.getElementById("dissatisfaction").value) || 0, 0, 100);
    const jobsFilled = Number(document.getElementById("jobsFilled").value) === 1;
    const popOver = Number(document.getElementById("popOver").value) === 1;
    const defenseLow = Number(document.getElementById("defenseLow").value) === 1;

    const requiredWork = terrainDifficulty * 4;
    const baseProgressPerTurn = (developmentPower / 10) * participants;
    const sumPct = govBonus + facilityBonus + policyBonus;
    const multiplier = clamp(1 + (sumPct / 100), 0.25, 5.0);
    const effectiveProgressPerTurn = baseProgressPerTurn * multiplier;
    const progressGainPercent = (effectiveProgressPerTurn / requiredWork) * 100;
    const newProgress = clamp(currentProgress + progressGainPercent, 0, 100);
    const estimatedTurnsLeft = newProgress >= 100
      ? 0
      : Math.ceil((requiredWork * (1 - newProgress / 100)) / effectiveProgressPerTurn);

    let dissDelta = 0;
    if (foodBalance < 0) dissDelta += 5;
    if (!jobsFilled) dissDelta += 3;
    if (popOver) dissDelta += 4;
    if (defenseLow) dissDelta += 2;
    if (foodBalance > 0 && jobsFilled) dissDelta -= 3;
    const newDiss = clamp(dissatisfaction + dissDelta, 0, 100);

    let dissTier = "安定";
    if (newDiss >= 75) dissTier = "暴動寸前（産出-30%・反乱判定）";
    else if (newDiss >= 50) dissTier = "高不満（産出-15%・治安-1）";
    else if (newDiss >= 25) dissTier = "不満（産出-5%）";

    let securityDelta = 1;
    if (foodBalance < 0) securityDelta -= 2;
    if (newDiss >= 75) securityDelta -= 3;

    const disasterResults = [];
    if (Math.random() * 100 < 2) {
      const s = rollDisasterSeverity();
      disasterResults.push(`都市災害: ${s.label}（産出${s.yieldPenalty}%${s.popDamage ? ` / 人口${s.popDamage}` : ""}）`);
    }
    if (Math.random() * 100 < 3) {
      const s = rollDisasterSeverity();
      disasterResults.push(`天候災害: ${s.label}（産出${s.yieldPenalty}%${s.popDamage ? ` / 人口${s.popDamage}` : ""}）`);
    }
    if (Math.random() * 100 < monsterRisk) {
      const s = rollDisasterSeverity();
      disasterResults.push(`モンスター災害: ${s.label}（産出${s.yieldPenalty}%${s.popDamage ? ` / 人口${s.popDamage}` : ""}）`);
    }

    const result = [
      `開拓進行: ${newProgress.toFixed(1)}%（+${progressGainPercent.toFixed(1)}%）`,
      `補正倍率: ${multiplier.toFixed(2)}倍（加算合計 ${sumPct}% を適用、0.25〜5.00でクランプ）`,
      `残りターン目安: ${estimatedTurnsLeft}`,
      `不満度: ${dissatisfaction} -> ${newDiss}（変化 ${dissDelta >= 0 ? "+" : ""}${dissDelta}）`,
      `不満段階: ${dissTier}`,
      `治安変化（仮）: ${securityDelta >= 0 ? "+" : ""}${securityDelta}`,
      `災害判定: ${disasterResults.length ? disasterResults.join(" / ") : "発生なし"}`
    ].join("\n");

    document.getElementById("simResult").textContent = result;
    document.getElementById("currentProgress").value = newProgress.toFixed(1);
    document.getElementById("dissatisfaction").value = newDiss;
  }

  document.getElementById("simTurnBtn").addEventListener("click", runPlaytestTurn);
}

window.App = window.App || {};
window.App.initSimulator = initSimulator;

