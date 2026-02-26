function initBattle() {
  const races = {
    "只人": { hp: 110, atk: 22 },
    "エルフ": { hp: 85, atk: 26 },
    "オーガ": { hp: 145, atk: 30 },
    "ゴブリン": { hp: 78, atk: 18 },
    "竜人": { hp: 125, atk: 28 },
    "悪魔": { hp: 95, atk: 32 },
    "天使": { hp: 105, atk: 21 },
    "ヴァンパイア": { hp: 100, atk: 24 }
  };

  const allyOrder = ["只人", "エルフ", "竜人", "天使"];
  const enemyOrder = ["オーガ", "ゴブリン", "悪魔", "ヴァンパイア"];

  const state = {
    turn: 1,
    buffAtk: 0,
    allies: [],
    enemies: [],
    activeSide: "ally",
    ended: false
  };

  function unitFromRace(race, side, id) {
    const base = races[race];
    return {
      id,
      side,
      race,
      name: `${race}${side === "ally" ? "兵" : "敵"}`,
      hp: base.hp,
      maxHp: base.hp,
      atk: base.atk,
      alive: true
    };
  }

  function aliveUnits(side) {
    const list = side === "ally" ? state.allies : state.enemies;
    return list.filter(u => u.alive);
  }

  function firstAlive(side) {
    return aliveUnits(side)[0] || null;
  }

  function damage(target, amount) {
    target.hp = Math.max(0, target.hp - amount);
    if (target.hp === 0) target.alive = false;
  }

  function heal(target, amount) {
    if (!target.alive) return;
    target.hp = Math.min(target.maxHp, target.hp + amount);
  }

  function setStatus(text, cls = "") {
    const el = document.getElementById("status");
    el.className = `status ${cls}`.trim();
    el.textContent = text;
  }

  function log(text, strong = false) {
    const line = document.createElement("div");
    line.innerHTML = strong ? `<b>${text}</b>` : text;
    const logEl = document.getElementById("log");
    logEl.prepend(line);
  }

  function unitCard(unit) {
    const hpRatio = Math.round((unit.hp / unit.maxHp) * 100);
    return `
      <article class="unit ${unit.side} ${unit.alive ? "" : "dead"}">
        <h3>${unit.name}</h3>
        <div class="small">種族: ${unit.race}</div>
        <div class="small">ATK: ${unit.atk} / HP: ${unit.hp}/${unit.maxHp}</div>
        <div class="hp-wrap"><div class="hp" style="width:${hpRatio}%;"></div></div>
      </article>
    `;
  }

  function render() {
    document.getElementById("allies").innerHTML = state.allies.map(unitCard).join("");
    document.getElementById("enemies").innerHTML = state.enemies.map(unitCard).join("");
    const disable = state.ended || state.activeSide !== "ally";
    document.getElementById("attackBtn").disabled = disable;
    document.getElementById("skillBtn").disabled = disable;
    document.getElementById("nextBtn").disabled = state.ended;
  }

  function checkEnd() {
    const allyAlive = aliveUnits("ally").length;
    const enemyAlive = aliveUnits("enemy").length;
    if (allyAlive === 0 || enemyAlive === 0) {
      state.ended = true;
      const win = enemyAlive === 0;
      setStatus(win ? "勝利" : "敗北", win ? "win" : "lose");
      log(win ? "敵部隊を壊滅させました。" : "味方部隊が全滅しました。", true);
    }
  }

  function normalAttack() {
    if (state.ended || state.activeSide !== "ally") return;
    const actor = firstAlive("ally");
    const target = firstAlive("enemy");
    if (!actor || !target) return;
    const value = actor.atk + state.buffAtk;
    state.buffAtk = 0;
    damage(target, value);
    log(`${actor.name}が${target.name}へ${value}ダメージ。`);
    if (!target.alive) log(`${target.name}を撃破。`);
    checkEnd();
    render();
  }

  function raceSkill() {
    if (state.ended || state.activeSide !== "ally") return;
    const actor = firstAlive("ally");
    if (!actor) return;
    const race = actor.race;
    const targetEnemy = firstAlive("enemy");
    if (!targetEnemy) return;

    switch (race) {
      case "只人":
        state.buffAtk = 10;
        log(`${actor.name}の戦術眼。次の通常攻撃が+10。`);
        break;
      case "エルフ":
        heal(actor, 20);
        log(`${actor.name}が森の加護で20回復。`);
        break;
      case "オーガ":
        damage(targetEnemy, 40);
        log(`${actor.name}が暴走し${targetEnemy.name}へ40ダメージ。`);
        break;
      case "ゴブリン":
        damage(targetEnemy, 24);
        log(`${actor.name}の奇襲で${targetEnemy.name}へ24ダメージ。`);
        break;
      case "竜人":
        aliveUnits("enemy").forEach(u => damage(u, 16));
        log(`${actor.name}が竜炎で敵全体へ16ダメージ。`);
        break;
      case "悪魔":
        damage(targetEnemy, 30);
        heal(actor, 10);
        log(`${actor.name}が魂喰で${targetEnemy.name}へ30ダメージ、10回復。`);
        break;
      case "天使":
        aliveUnits("ally").forEach(u => heal(u, 12));
        log(`${actor.name}が聖域を展開し味方全体を12回復。`);
        break;
      case "ヴァンパイア":
        damage(targetEnemy, 26);
        heal(actor, 13);
        log(`${actor.name}が吸血で${targetEnemy.name}へ26ダメージ、13回復。`);
        break;
    }

    checkEnd();
    render();
  }

  function enemyTurn() {
    if (state.ended) return;
    const actor = firstAlive("enemy");
    const target = firstAlive("ally");
    if (!actor || !target) return;

    let value = actor.atk;
    if (actor.race === "ゴブリン") value += 6;
    if (actor.race === "悪魔") {
      value += 4;
      heal(actor, 6);
    }

    damage(target, value);
    log(`${actor.name}が${target.name}へ${value}ダメージ。`);
    if (!target.alive) log(`${target.name}が倒れた。`);
    checkEnd();
  }

  function endTurn() {
    if (state.ended) return;
    if (state.activeSide === "ally") {
      state.activeSide = "enemy";
      setStatus(`ターン: ${state.turn} / 敵の行動`);
      enemyTurn();
      if (!state.ended) {
        state.activeSide = "ally";
        state.turn += 1;
        setStatus(`ターン: ${state.turn} / あなたの行動`);
      }
    }
    render();
  }

  function resetBattle() {
    state.turn = 1;
    state.buffAtk = 0;
    state.activeSide = "ally";
    state.ended = false;
    state.allies = allyOrder.map((r, i) => unitFromRace(r, "ally", `a${i}`));
    state.enemies = enemyOrder.map((r, i) => unitFromRace(r, "enemy", `e${i}`));
    document.getElementById("log").innerHTML = "";
    log("戦闘開始。あなたが先攻です。");
    render();
  }

  document.getElementById("attackBtn").addEventListener("click", normalAttack);
  document.getElementById("skillBtn").addEventListener("click", raceSkill);
  document.getElementById("nextBtn").addEventListener("click", endTurn);
  document.getElementById("resetBtn").addEventListener("click", resetBattle);

  resetBattle();
}

window.App = window.App || {};
window.App.initBattle = initBattle;

