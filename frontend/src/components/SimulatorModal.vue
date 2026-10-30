<script setup>
import { computed, reactive } from "vue";
import BaseModal from "./BaseModal.vue";
import {
  buildWeaponAttackRow,
  computeAttackDamage,
  resolveAttackPower
} from "../lib/v39-combat-engine.js";
import { DAMAGE_TYPE_FIELDS } from "../constants/unitCommon.js";

defineProps({
  show: { type: Boolean, default: false },
  sim: {
    type: Object,
    default: () => ({})
  },
  simResult: { type: String, default: "" }
});

defineEmits(["close", "run-turn"]);

const damageTune = reactive({
  attackStat: 100,
  magicStat: 100,
  accuracy: 100,
  skillPower: 50,
  weaponPower: 50,
  judgeStat: "攻撃",
  bonusStat: "",
  attackMethod: "武器",
  damageType: "物理",
  attackCount: 1,
  criticalRate: 10,
  criticalPower: 125,
  resistancePenetration: 0,
  targetHp: 1000,
  targetLevel: 1,
  targetDefense: 100,
  targetSpirit: 100,
  targetEvasion: 100,
  targetResistance: 0,
  targetCriticalRateResistance: 0,
  targetCriticalPowerResistance: 0,
  finalDamageMultiplier: 1.5
});

const damageTypeOptions = DAMAGE_TYPE_FIELDS;
const weaponMethods = new Set(["武器", "弓", "銃"]);
const physicalCriticalTypes = new Set(["物理", "射撃", "切断", "貫通", "打撃"]);

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, number(value, min)));

const usesWeaponPower = computed(() => weaponMethods.has(String(damageTune.attackMethod || "")));
const criticalAvailable = computed(() => (
  !String(damageTune.judgeStat || "").includes("魔")
  && String(damageTune.attackMethod || "") !== "魔法"
  && physicalCriticalTypes.has(String(damageTune.damageType || ""))
));

function tuningWeaponName() {
  if (String(damageTune.attackMethod || "") === "弓") return "調整用弓";
  if (String(damageTune.attackMethod || "") === "銃") return "調整用銃";
  return "調整用武器";
}

function createEquipment(criticalRateOverride = null) {
  const weaponPower = Math.max(0, number(damageTune.weaponPower));
  const criticalRate = criticalRateOverride === null
    ? clamp(damageTune.criticalRate, 0, 100)
    : clamp(criticalRateOverride, 0, 100);
  const criticalPower = Math.max(100, number(damageTune.criticalPower, 125));
  const weaponName = tuningWeaponName();
  return {
    slot: "武器1",
    name: weaponName,
    power: weaponPower,
    criticalRate,
    criticalPower,
    source: {
      装備名: weaponName,
      威力: weaponPower,
      Cr率: criticalRate,
      Cr威力: criticalPower
    }
  };
}

function createAttacker(criticalRateOverride = null, includeEquipment = true) {
  return {
    id: "damage-tuning-attacker",
    level: 1,
    status: {
      HP: 1000,
      攻撃: Math.max(0, number(damageTune.attackStat)),
      魔力: Math.max(0, number(damageTune.magicStat)),
      精神: Math.max(0, number(damageTune.magicStat)),
      命中: Math.max(0, number(damageTune.accuracy)),
      Cr率: 0,
      Cr威力: 0,
      耐性貫通: Math.max(0, number(damageTune.resistancePenetration))
    },
    equipment: includeEquipment ? [createEquipment(criticalRateOverride)] : [],
    techniques: [],
    combatProfile: { attackCount: 1 }
  };
}

function createSkillRow() {
  const damageType = String(damageTune.damageType || "物理");
  return {
    名前: "ダメージ調整用スキル",
    行動: "A",
    攻撃手段: String(damageTune.attackMethod || "武器"),
    判定: String(damageTune.judgeStat || "攻撃"),
    追加威力: String(damageTune.bonusStat || ""),
    攻撃回数: Math.max(1, Math.floor(number(damageTune.attackCount, 1))),
    [damageType]: Math.max(0, number(damageTune.skillPower)),
    Cr率: 0,
    Cr威力: 0,
    効果: ""
  };
}

function createTarget() {
  const damageType = String(damageTune.damageType || "物理");
  const resistanceKey = `${damageType}耐性`;
  const hp = Math.max(1, Math.floor(number(damageTune.targetHp, 1)));
  return {
    id: "damage-tuning-target",
    level: Math.max(1, Math.floor(number(damageTune.targetLevel, 1))),
    hp,
    currentHp: hp,
    maxHp: hp,
    status: {
      HP: hp,
      防御: Math.max(0, number(damageTune.targetDefense)),
      精神: Math.max(0, number(damageTune.targetSpirit)),
      回避: Math.max(1, number(damageTune.targetEvasion, 1)),
      [resistanceKey]: Math.max(0, number(damageTune.targetResistance)),
      Cr率耐性: Math.max(0, number(damageTune.targetCriticalRateResistance)),
      Cr威力耐性: Math.max(0, number(damageTune.targetCriticalPowerResistance))
    },
    resistances: {
      [resistanceKey]: Math.max(0, number(damageTune.targetResistance)),
      Cr率耐性: Math.max(0, number(damageTune.targetCriticalRateResistance)),
      Cr威力耐性: Math.max(0, number(damageTune.targetCriticalPowerResistance))
    }
  };
}

function createFixedRandom(randomRateSource, critical) {
  let call = 0;
  const cycle = critical ? 3 : 2;
  return () => {
    const phase = call % cycle;
    call += 1;
    if (phase === 0) return 0;
    if (phase === 1) return randomRateSource;
    return 0;
  };
}

function calculateDamage(randomRateSource, critical = false) {
  const criticalRateOverride = critical ? 100 : 0;
  return computeAttackDamage({
    attacker: createAttacker(criticalRateOverride, true),
    target: createTarget(),
    skillRow: createSkillRow(),
    damageType: String(damageTune.damageType || "物理"),
    random: createFixedRandom(randomRateSource, critical),
    gameSettings: {
      combatDamageMultiplier: clamp(damageTune.finalDamageMultiplier, 0, 10)
    }
  });
}

const damageSummary = computed(() => {
  const skillRow = createSkillRow();
  const attacker = createAttacker(null, true);
  const skillOnlyAttacker = createAttacker(null, false);
  const skillPower = resolveAttackPower(skillRow, skillOnlyAttacker);
  const weaponRow = buildWeaponAttackRow(createEquipment(null));
  const weaponPower = usesWeaponPower.value ? resolveAttackPower(weaponRow, attacker) : 0;
  const combinedPower = resolveAttackPower(skillRow, attacker);

  const minimum = calculateDamage(0, false);
  const average = calculateDamage(0.5, false);
  const maximum = calculateDamage(1, false);
  const criticalAverage = criticalAvailable.value ? calculateDamage(0.5, true) : null;

  const probe = computeAttackDamage({
    attacker,
    target: createTarget(),
    skillRow,
    damageType: String(damageTune.damageType || "物理"),
    random: createFixedRandom(0.5, clamp(damageTune.criticalRate, 0, 100) > 0 && criticalAvailable.value),
    gameSettings: {
      combatDamageMultiplier: clamp(damageTune.finalDamageMultiplier, 0, 10)
    }
  });

  const targetHp = Math.max(1, Math.floor(number(damageTune.targetHp, 1)));
  const averageHitsToDefeat = average.total > 0 ? Math.ceil(targetHp / average.total) : null;

  return {
    skillPower,
    weaponPower,
    combinedPower,
    minimum: minimum.total,
    average: average.total,
    maximum: maximum.total,
    criticalAverage: criticalAverage?.total ?? null,
    hitRate: Math.round(number(probe.detail?.hitRate) * 1000) / 10,
    criticalRate: Math.round(number(probe.detail?.criticalRate) * 1000) / 10,
    criticalMultiplier: Math.round(number(probe.detail?.criticalMultiplier, 1) * 100) / 100,
    defenseKey: String(probe.detail?.defenseKey || "防御"),
    defense: number(probe.detail?.defense),
    resistanceKey: String(probe.detail?.resistanceKey || ""),
    effectiveResistance: Math.round(number(probe.detail?.effectiveResistance) * 10) / 10,
    attackCount: Math.max(1, Math.floor(number(probe.detail?.attackCount, 1))),
    averageHitsToDefeat
  };
});
</script>

<template>
  <base-modal :show="show" title="プレイテスト計算（仮）" :wide="true" @close="$emit('close')">
    <section class="tuning-section">
      <h3>ダメージ調整</h3>
      <p class="tuning-note">
        本番戦闘と同じ計算関数を使用。武器・弓・銃の攻撃スキルは「スキル威力 + 武器威力」で計算します。
        最低 / 平均 / 最大は命中した非クリティカル時の乱数 0.40 / 0.45 / 0.50 です。
      </p>

      <div class="damage-grid">
        <label>攻撃
          <input v-model.number="damageTune.attackStat" type="number" min="0" />
        </label>
        <label>魔力
          <input v-model.number="damageTune.magicStat" type="number" min="0" />
        </label>
        <label>命中
          <input v-model.number="damageTune.accuracy" type="number" min="0" />
        </label>
        <label>判定ステータス
          <select v-model="damageTune.judgeStat">
            <option value="攻撃">攻撃</option>
            <option value="魔力">魔力</option>
            <option value="精神">精神</option>
            <option value="命中">命中</option>
          </select>
        </label>
        <label>追加威力
          <select v-model="damageTune.bonusStat">
            <option value="">なし</option>
            <option value="攻撃">攻撃</option>
            <option value="魔力">魔力</option>
            <option value="精神">精神</option>
            <option value="命中">命中</option>
          </select>
        </label>
        <label>攻撃手段
          <select v-model="damageTune.attackMethod">
            <option value="武器">武器</option>
            <option value="弓">弓</option>
            <option value="銃">銃</option>
            <option value="素手">素手</option>
            <option value="魔法">魔法</option>
          </select>
        </label>
        <label>ダメージ種別
          <select v-model="damageTune.damageType">
            <option v-for="type in damageTypeOptions" :key="type" :value="type">{{ type }}</option>
          </select>
        </label>
        <label>スキル基礎威力
          <input v-model.number="damageTune.skillPower" type="number" min="0" />
        </label>
        <label>武器基礎威力
          <input v-model.number="damageTune.weaponPower" type="number" min="0" :disabled="!usesWeaponPower" />
        </label>
        <label>攻撃回数
          <input v-model.number="damageTune.attackCount" type="number" min="1" max="20" />
        </label>
        <label>Cr率（武器）%
          <input v-model.number="damageTune.criticalRate" type="number" min="0" max="100" />
        </label>
        <label>Cr威力（武器）%
          <input v-model.number="damageTune.criticalPower" type="number" min="100" />
        </label>
        <label>耐性貫通
          <input v-model.number="damageTune.resistancePenetration" type="number" min="0" />
        </label>
        <label>最終ダメージ倍率
          <input v-model.number="damageTune.finalDamageMultiplier" type="number" min="0" max="10" step="0.1" />
        </label>
      </div>

      <h4>防御側</h4>
      <div class="damage-grid">
        <label>HP
          <input v-model.number="damageTune.targetHp" type="number" min="1" />
        </label>
        <label>Lv
          <input v-model.number="damageTune.targetLevel" type="number" min="1" />
        </label>
        <label>防御
          <input v-model.number="damageTune.targetDefense" type="number" min="0" />
        </label>
        <label>精神
          <input v-model.number="damageTune.targetSpirit" type="number" min="0" />
        </label>
        <label>回避
          <input v-model.number="damageTune.targetEvasion" type="number" min="1" />
        </label>
        <label>{{ damageTune.damageType }}耐性
          <input v-model.number="damageTune.targetResistance" type="number" min="0" />
        </label>
        <label>Cr率耐性
          <input v-model.number="damageTune.targetCriticalRateResistance" type="number" min="0" />
        </label>
        <label>Cr威力耐性
          <input v-model.number="damageTune.targetCriticalPowerResistance" type="number" min="0" />
        </label>
      </div>

      <div class="damage-results">
        <div class="damage-result-card">
          <span>スキル威力</span>
          <strong>{{ damageSummary.skillPower }}</strong>
          <small>判定・追加威力反映後</small>
        </div>
        <div class="damage-result-card">
          <span>武器威力</span>
          <strong>{{ usesWeaponPower ? damageSummary.weaponPower : "加算なし" }}</strong>
          <small>{{ usesWeaponPower ? "攻撃補正反映後" : "攻撃手段が武器系ではありません" }}</small>
        </div>
        <div class="damage-result-card emphasized">
          <span>合計攻撃威力</span>
          <strong>{{ damageSummary.combinedPower }}</strong>
          <small>{{ usesWeaponPower ? "スキル + 武器" : "スキルのみ" }}</small>
        </div>
        <div class="damage-result-card">
          <span>最低ダメージ</span>
          <strong>{{ damageSummary.minimum }}</strong>
          <small>乱数 0.40 / 非Cr</small>
        </div>
        <div class="damage-result-card emphasized">
          <span>平均ダメージ</span>
          <strong>{{ damageSummary.average }}</strong>
          <small>乱数 0.45 / 非Cr</small>
        </div>
        <div class="damage-result-card">
          <span>最大ダメージ</span>
          <strong>{{ damageSummary.maximum }}</strong>
          <small>乱数 0.50 / 非Cr</small>
        </div>
        <div class="damage-result-card">
          <span>Cr平均ダメージ</span>
          <strong>{{ damageSummary.criticalAverage ?? "対象外" }}</strong>
          <small>Cr {{ damageSummary.criticalRate }}% / ×{{ damageSummary.criticalMultiplier }}</small>
        </div>
        <div class="damage-result-card">
          <span>命中率</span>
          <strong>{{ damageSummary.hitRate }}%</strong>
          <small>{{ damageSummary.attackCount }}ヒット判定</small>
        </div>
        <div class="damage-result-card">
          <span>平均撃破回数</span>
          <strong>{{ damageSummary.averageHitsToDefeat ?? "∞" }}</strong>
          <small>命中時平均ダメージ基準</small>
        </div>
      </div>

      <div class="damage-detail-line">
        防御判定: {{ damageSummary.defenseKey }} {{ damageSummary.defense }} / 
        {{ damageSummary.resistanceKey }}: {{ damageSummary.effectiveResistance }}（貫通後）
      </div>
    </section>

    <hr class="section-divider" />

    <section class="tuning-section">
      <h3>領土プレイテスト</h3>
      <div class="sim-grid">
        <label>地形難易度
          <input v-model.number="sim.terrainDifficulty" type="number" min="1" max="5" />
        </label>
        <label>開拓値
          <input v-model.number="sim.developmentPower" type="number" min="1" />
        </label>
        <label>参加人数（上限4）
          <input v-model.number="sim.participants" type="number" min="1" max="4" />
        </label>
        <label>現在開拓進捗（%）
          <input v-model.number="sim.currentProgress" type="number" min="0" max="100" />
        </label>
        <label>国家体制補正（%）
          <input v-model.number="sim.govBonus" type="number" />
        </label>
        <label>施設補正（%）
          <input v-model.number="sim.facilityBonus" type="number" />
        </label>
        <label>政策補正（%）
          <input v-model.number="sim.policyBonus" type="number" />
        </label>
        <label>モンスター災害率（%）
          <input v-model.number="sim.monsterRisk" type="number" min="0" max="100" />
        </label>
        <label>食料収支
          <select v-model.number="sim.foodBalance">
            <option :value="1">黒字</option>
            <option :value="0">均衡</option>
            <option :value="-1">赤字</option>
          </select>
        </label>
        <label>現在不満度（0-100）
          <input v-model.number="sim.dissatisfaction" type="number" min="0" max="100" />
        </label>
        <label>仕事充足
          <select v-model.number="sim.jobsFilled">
            <option :value="1">充足</option>
            <option :value="0">不足</option>
          </select>
        </label>
        <label>人口超過
          <select v-model.number="sim.popOver">
            <option :value="0">なし</option>
            <option :value="1">あり</option>
          </select>
        </label>
        <label>防衛不足
          <select v-model.number="sim.defenseLow">
            <option :value="0">なし</option>
            <option :value="1">あり</option>
          </select>
        </label>
      </div>
      <div style="margin-top: 8px;">
        <button class="secondary" @click="$emit('run-turn')">1ターン計算</button>
      </div>
      <div id="simResult">{{ simResult }}</div>
    </section>
  </base-modal>
</template>

<style scoped>
.tuning-section {
  display: grid;
  gap: 10px;
}

.tuning-section h3,
.tuning-section h4 {
  margin: 0;
}

.tuning-note {
  margin: 0;
  opacity: 0.82;
  line-height: 1.5;
}

.damage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}

.damage-grid label {
  display: grid;
  gap: 4px;
}

.damage-grid input,
.damage-grid select {
  width: 100%;
  box-sizing: border-box;
}

.damage-results {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 8px;
  margin-top: 4px;
}

.damage-result-card {
  display: grid;
  gap: 3px;
  padding: 10px;
  border: 1px solid currentColor;
  border-radius: 8px;
  opacity: 0.86;
}

.damage-result-card.emphasized {
  opacity: 1;
  border-width: 2px;
}

.damage-result-card strong {
  font-size: 1.35rem;
}

.damage-result-card small {
  opacity: 0.72;
}

.damage-detail-line {
  padding: 8px 10px;
  border: 1px dashed currentColor;
  border-radius: 8px;
  opacity: 0.82;
}

.section-divider {
  margin: 18px 0;
  opacity: 0.35;
}
</style>
