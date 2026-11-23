<script setup>
import BaseModal from "./BaseModal.vue";
import V39SelectionDetailPanel from "./V39SelectionDetailPanel.vue";

defineProps({
  show:Boolean, title:String, subtitle:String, listLabel:String, categoryLabel:String,
  categories:Array, category:String, rows:Array, selectedId:String, selected:Object, detail:Object,
  preview:Object, activeDetailTab:String, skillTitle:String, emptyText:String, backLabel:String, confirmLabel:String,
  compactPreview:Boolean,
  categoryAttribute:{type:String,default:"data-v39-list2-category"},
  rowAttribute:{type:String,default:"data-v39-list2-option"},
  confirmAttribute:{type:String,default:"data-v39-list2-confirm"}
});
defineEmits(["close", "back", "category", "select", "detail-tab", "confirm"]);
</script>

<template>
  <base-modal :show="show" :title="title" :subtitle="subtitle" :wide="true"
    :close-on-backdrop="false" variant="v39" @close="$emit('close')">
    <div v-if="categories.length || rows.length" class="class-screen-layout v39-item-list-screen-2"
      :class="{ 'no-preview':!preview, 'with-compact-preview':compactPreview && preview }">
      <section v-if="preview" class="class-preview-frame" :aria-label="preview.label">
        <div class="class-preview-inner">
          <div v-if="preview.style" class="class-preview-sprite" :style="preview.style" role="img" :aria-label="preview.label" />
          <img v-else-if="preview.src" :src="preview.src" :alt="preview.label" class="class-preview-image" />
          <div v-else class="class-preview-empty"><strong>画像未設定</strong><span>{{ preview.fallback }}</span></div>
        </div>
      </section>

      <div class="class-layout" :class="{ 'no-categories':!categories.length }">
        <section v-if="categories.length" class="class-category-pane">
          <nav class="class-category-tabs" role="tablist" :aria-label="categoryLabel">
            <button v-for="value in categories" :key="value" type="button" role="tab"
              :aria-selected="category === value" :class="{ active:category === value }"
              v-bind="{ [categoryAttribute]:value }" @click="$emit('category',value)">
              <strong>{{ value }}</strong>
            </button>
          </nav>
        </section>

        <section class="class-main-pane">
          <aside class="class-list">
            <div v-if="listLabel" class="class-list-head">{{ listLabel }}</div>
            <button v-for="row in rows" :key="row.id" type="button" class="class-item"
              :class="{ active:selectedId === row.id }" :aria-pressed="selectedId === row.id"
              v-bind="{ [rowAttribute]:row.id }" @click="$emit('select',row.id)">
              <span class="class-item-main">
                <img v-if="row.icon" :src="row.icon" alt="" class="class-item-icon" />
                <span v-else class="class-item-icon-fallback" aria-hidden="true">{{ row.label.slice(0,1) }}</span>
                <span class="class-item-name">{{ row.label }}<small v-if="row.unavailable">未達</small></span>
              </span>
            </button>
          </aside>

          <section v-if="selected" class="class-detail">
            <header class="class-title">
              <h3>{{ selected.label }}</h3>
              <div v-if="selected.type" class="class-title-sub">{{ selected.type }}</div>
              <p v-if="selected.description" class="class-text">{{ selected.description }}</p>
              <p v-if="selected.requirement" class="class-text">取得条件 {{ selected.requirement }}</p>
              <p v-for="reason in selected.reasons" :key="reason" class="class-text">{{ reason }}</p>
            </header>
            <v39-selection-detail-panel v-bind="detail" :active-tab="activeDetailTab" :skill-title="skillTitle"
              @update:active-tab="$emit('detail-tab',$event)" />
            <div class="class-detail-footer">
              <slot name="before-actions" />
              <div class="class-actions">
                <button v-if="backLabel" type="button" class="secondary" @click="$emit('back')">{{ backLabel }}</button>
                <button type="button" v-bind="{ [confirmAttribute]:'' }" :disabled="selected.unavailable"
                  @click="$emit('confirm')">{{ confirmLabel }}</button>
              </div>
            </div>
          </section>
          <section v-else class="class-detail class-detail-empty"><strong>候補を選択してください</strong></section>
        </section>
      </div>
    </div>
    <p v-else class="class-empty">{{ emptyText }}</p>
  </base-modal>
</template>

<style scoped>
.class-screen-layout {
  min-width:0;
  min-height:0;
  height:100%;
  display:grid;
  grid-template-rows:minmax(144px,1fr) minmax(0,4fr);
  gap:10px;
  overflow:hidden;
}

.class-preview-frame {
  min-width:0;
  min-height:0;
  display:grid;
  place-items:center;
  padding:7px;
  border:1px solid var(--picker-line);
  border-radius:8px;
  background:linear-gradient(180deg,#101d22,#0c171b);
  overflow:hidden;
}

.class-preview-inner {
  width:100%;
  height:100%;
  min-height:0;
  display:grid;
  place-items:center;
}

.class-preview-sprite {
  position:relative;
  width:128px;
  height:128px;
  max-width:100%;
  max-height:100%;
  flex:0 0 auto;
  overflow:hidden;
  border:1px solid #314950;
  border-radius:7px;
  background:#091216;
}

.class-preview-image {
  width:128px;
  height:128px;
  max-width:100%;
  max-height:100%;
  object-fit:contain;
}

.class-preview-empty {
  display:grid;
  gap:4px;
  place-items:center;
  color:var(--picker-muted);
  text-align:center;
}

.class-preview-empty strong {
  color:#dce8e7;
  font-size:var(--font-size-14);
}

.class-preview-empty span {
  font-size:var(--font-size-11);
}

.class-layout {
  display:grid;
  grid-template-rows:auto minmax(0,1fr);
  gap:10px;
  min-width:0;
  min-height:0;
  height:100%;
  overflow:hidden;
}

.class-category-pane {
  min-height:0;
  padding:8px;
  border:1px solid var(--picker-line);
  border-radius:8px;
  background:#0d181c;
  overflow:hidden;
}

.class-category-tabs {
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:7px;
}

.class-category-tabs button {
  min-width:0;
  min-height:40px;
  display:grid;
  place-items:center;
  padding:6px 8px;
  border:1px solid #385159;
  border-radius:7px;
  background:#122126;
  color:#a9babc;
  text-align:center;
  cursor:pointer;
}

.class-category-tabs button strong {
  color:#dfe9e8;
  font-size:var(--font-size-14);
  font-weight:900;
  white-space:nowrap;
}

.class-category-tabs button:hover {
  border-color:#4e7580;
  color:#dbe8e8;
}

.class-category-tabs button.active {
  border-color:var(--picker-active);
  background:var(--picker-active-bg);
  color:#f4fbfa;
  box-shadow:0 0 0 1px rgba(113,209,223,.13) inset;
}

.class-category-tabs button.active strong {
  color:#f4fbfa;
}

.class-main-pane {
  min-width:0;
  min-height:0;
  display:grid;
  grid-template-columns:minmax(220px,300px) minmax(0,1fr);
  gap:10px;
  overflow:hidden;
}

.class-list {
  min-width:0;
  min-height:0;
  height:100%;
  overflow-y:auto;
  overscroll-behavior:contain;
  display:grid;
  gap:6px;
  align-content:start;
  padding:7px;
  border:1px solid var(--picker-line);
  border-radius:8px;
  background:#0d181c;


}

.class-list-head {
  padding:4px 3px 6px;
  color:#9fb1b4;
  font-size:var(--font-compact);
  font-weight:800;
}

.class-item {
  width:100%;
  min-height:48px;
  display:flex;
  align-items:center;
  gap:8px;
  padding:6px 8px;
  border:1px solid #30464d;
  border-radius:7px;
  background:#122126;
  color:#dce7e6;
  font-size:var(--font-body);
  font-weight:700;
  text-align:left;
  cursor:pointer;
  transition:border-color .12s ease,background .12s ease,transform .12s ease;
}

.class-item:hover {
  border-color:#4f7580;
  background:#162a30;
}

.class-item:active {
  transform:translateY(1px);
}

.class-item.active {
  border-color:var(--picker-active);
  background:var(--picker-active-bg);
  color:#f3fbfa;
  box-shadow:0 0 0 1px rgba(113,209,223,.16) inset;
}

.class-item-main {
  display:inline-flex;
  align-items:center;
  gap:8px;
  min-width:0;
}

.class-item-name {
  min-width:0;
  white-space:normal;
  overflow-wrap:anywhere;
  line-height:1.2;
}

.class-item-icon,
.class-item-icon-fallback {
  width:34px;
  height:34px;
  flex:0 0 auto;
  border:1px solid #45616a;
  border-radius:6px;
  background:#17282e;
}

.class-item-icon {
  object-fit:cover;
}

.class-item-icon-fallback {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  color:#9ce8f1;
  font-size:var(--font-size-16);
  font-weight:900;
}

.class-detail {
  min-width:0;
  min-height:0;
  height:100%;
  overflow:hidden;
  display:grid;
  grid-template-rows:auto minmax(0,1fr) auto;
  gap:9px;
  padding:10px;
  border:1px solid var(--picker-line);
  border-radius:8px;
  background:linear-gradient(180deg,#101d22,#0c171b);
}

.class-title {
  min-width:0;
}

.class-title h3 {
  margin:0;
  color:var(--picker-text);
  font-size:var(--font-size-24);
  line-height:1.15;
}

.class-title-sub {
  margin-top:3px;
  color:#90dce7;
  font-size:var(--font-secondary);
  font-weight:700;
}

.class-text {
  margin:6px 0 0;
  color:var(--picker-muted);
  font-size:var(--font-secondary);
  line-height:1.5;
}

.class-actions {
  display:flex;
  justify-content:space-between;
  gap:8px;
}

.class-actions button {
  min-height:38px;
  padding:6px 14px;
  border:1px solid var(--picker-active);
  border-radius:7px;
  background:#1a4b55;
  color:#f2fbfa;
  font-size:var(--font-secondary);
  font-weight:900;
  cursor:pointer;
}

.class-actions button:hover {
  background:#205964;
}

.class-actions button.secondary {
  border-color:#42585f;
  background:#132126;
  color:#b8c7c9;
}

.class-actions button.secondary:hover {
  border-color:#5c7982;
  background:#182b31;
  color:#e2eceb;
}

.class-detail-empty {
  grid-template-rows:1fr;
  place-content:center;
  text-align:center;
  color:var(--picker-muted);
}

.class-detail-empty strong {
  color:#dce8e7;
  font-size:var(--font-size-18);
}

.class-detail-empty span {
  margin-top:5px;
  font-size:var(--font-compact);
}

.class-empty {
  padding:12px;
  border:1px dashed #3d5961;
  border-radius:8px;
  background:#0e1a1e;
  color:var(--picker-muted);
  font-size:var(--font-secondary);
}

@media (max-width:760px) {
  .class-screen-layout {
    grid-template-rows:minmax(136px,1fr) minmax(0,4fr);
    gap:7px;
  }

  .class-preview-frame {
    padding:4px;
  }

  .class-layout {
    grid-template-rows:54px minmax(0,1fr);
    gap:7px;
  }

  .class-category-pane {
    padding:6px;
  }

  .class-category-tabs {
    height:100%;
    gap:4px;
  }

  .class-category-tabs button {
    min-height:0;
    height:100%;
    padding:4px 3px;
  }

  .class-category-tabs button strong {
    font-size:var(--font-size-11);
  }

  .class-main-pane {
    grid-template-columns:minmax(130px,35%) minmax(0,65%);
    gap:7px;
  }

  .class-list {
    max-height:none;
    height:100%;
    display:grid;
    grid-template-columns:1fr;
    align-content:start;
    overflow-x:hidden;
    overflow-y:auto;
    padding:5px;
  }

  .class-list-head {
    padding:3px 2px 5px;
    font-size:var(--font-size-10);
  }

  .class-item {
    width:100%;
    min-width:0;
    min-height:52px;
    padding:6px;
    font-size:var(--font-compact);
  }

  .class-item-main {
    width:100%;
    gap:6px;
  }

  .class-item-icon,
  .class-item-icon-fallback {
    width:32px;
    height:32px;
  }

  .class-item-name {
    flex:1 1 auto;
    font-size:var(--font-size-11);
  }

  .class-detail {
    height:100%;
    max-height:none;
    gap:6px;
    padding:7px;
  }

  .class-title h3 {
    font-size:var(--font-size-18);
  }

  .class-title-sub {
    font-size:var(--font-size-11);
  }

  .class-text {
    margin-top:4px;
    font-size:var(--font-size-11);
  }

  .class-actions button {
    flex:1 1 0;
    min-width:0;
    min-height:36px;
    padding:5px 6px;
    font-size:var(--font-size-11);
  }
}

@media (max-width:430px) {
  .class-main-pane {
    grid-template-columns:minmax(126px,36%) minmax(0,64%);
  }

  .class-category-tabs button strong {
    font-size:var(--font-size-10);
  }

  .class-item {
    min-height:50px;
  }

  .class-item-name {
    font-size:var(--font-size-10);
  }
}

.class-screen-layout.no-preview, .class-layout.no-categories { grid-template-rows:minmax(0,1fr); }
.class-screen-layout.with-compact-preview{
  grid-template-columns:auto minmax(0,1fr);
  grid-template-rows:auto minmax(0,1fr);
}
.with-compact-preview .class-layout{display:contents}
.with-compact-preview .class-preview-frame{grid-area:1/1;padding:4px}
.with-compact-preview .class-preview-sprite,.with-compact-preview .class-preview-image{width:88px;height:88px}
.with-compact-preview .class-category-pane{grid-area:1/2;align-content:center}
.with-compact-preview .class-category-tabs{height:auto;grid-template-columns:repeat(auto-fit,minmax(74px,1fr))}
.with-compact-preview .class-category-tabs button{height:auto;min-height:30px}
.with-compact-preview .class-main-pane{grid-area:2/1/3/-1}
.class-item-name small { display:block; color:#b8c7c9; }
.class-title { max-height:30vh; overflow:auto; }
.class-actions button:disabled { opacity:.55; cursor:default; }
</style>
