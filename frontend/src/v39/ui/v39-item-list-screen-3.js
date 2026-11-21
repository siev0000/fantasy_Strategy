import "../unit/v39-fusion-modal.css";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[character]));

function dataAttribute(name, value = "") {
  return /^data-[a-z][a-z0-9-]*$/.test(name) ? ` ${name}="${escapeHtml(value)}"` : "";
}

function actionButton({attribute, label, ariaLabel, disabled = false}) {
  return `<button type="button"${dataAttribute(attribute)}${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ""}${disabled ? " disabled" : ""}>${escapeHtml(label)}</button>`;
}

export function renderV39ItemListScreen3({
  title, titleId, closeAction, caption, recipes, recipeAttribute, preview = "", controls = "", slots = [],
  slotAttribute, candidates = [], candidateAttribute, candidateHeading, candidateScope, emptyText, detail = "",
  status, actions = []
}) {
  const headingId = escapeHtml(titleId);
  if (recipes) {
    return `<section class="fusion-recipe-picker v39-item-list-screen-3" role="dialog" aria-modal="true" aria-labelledby="${headingId}">
      <header><h3 id="${headingId}">${escapeHtml(title)}</h3>${actionButton(closeAction)}</header>
      <div class="fusion-recipe-list">${recipes.map(recipe => `<button type="button" class="fusion-recipe-card"${dataAttribute(recipeAttribute, recipe.id)}>
        ${recipe.preview}<span><strong>${escapeHtml(recipe.label)}</strong>${recipe.notes.map(note => `<small>${escapeHtml(note)}</small>`).join("")}</span>
      </button>`).join("") || `<p>${escapeHtml(emptyText)}</p>`}</div>
    </section>`;
  }

  const slotBar = slots.length ? `<div class="fusion-slots" role="tablist" aria-label="素材枠">${slots.map(slot =>
    `<button type="button" role="tab" aria-selected="${slot.selected}"${dataAttribute(slotAttribute, slot.id)}>${escapeHtml(slot.label)}</button>`
  ).join("")}</div>` : "";
  const rows = candidates.map(row => candidateAttribute ? `<div class="fusion-candidate${row.reason ? " unavailable" : ""}"${dataAttribute(candidateAttribute, row.id)}>
    ${row.content}${row.reason ? `<small>${escapeHtml(row.reason)}</small>` : ""}
  </div>` : row.content).join("");
  return `<section class="v39-item-list-screen-3" role="dialog" aria-modal="true" aria-labelledby="${headingId}">
    <header><h3 id="${headingId}">${escapeHtml(title)}</h3><span>${escapeHtml(caption)}</span>${actionButton(closeAction)}</header>
    ${preview}<div class="fusion-workspace">${controls}${slotBar}
      <div class="fusion-panes"><div class="fusion-material-pane">
        <div class="fusion-list-heading">${escapeHtml(candidateHeading)}<small>${escapeHtml(candidateScope)}</small></div>
        <div class="squad-member-list" data-fusion-candidates>${rows || (emptyText ? `<div class="squad-empty">${escapeHtml(emptyText)}</div>` : "")}</div>
      </div><div class="squad-detail-pane">${detail}</div></div>
    </div>
    <footer><div class="fusion-status" role="status">${escapeHtml(status)}</div>
      <div class="fusion-footer-buttons">${actions.map(actionButton).join("")}</div></footer>
  </section>`;
}
