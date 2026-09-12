const DOC_MODULES = import.meta.glob("../../docs/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default"
});

function normalizeDocs() {
  return Object.entries(DOC_MODULES)
    .map(([sourcePath, content]) => {
      const path = sourcePath.replace(/^\.\.\/\.\.\//, "");
      const fileName = path.split("/").pop() || path;
      const text = String(content ?? "");
      const titleLine = text.split(/\r?\n/).find(line => /^#\s+/.test(line.trim()));
      const title = titleLine ? titleLine.replace(/^#\s+/, "").trim() : fileName.replace(/\.md$/i, "");
      return { path, fileName, title, text };
    })
    .sort((a, b) => a.path.localeCompare(b.path, "ja"));
}

const DOCS = normalizeDocs();

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return html;
}

function renderMarkdown(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inCode = false;
  let codeLines = [];
  let listType = null;

  const closeList = () => {
    if (!listType) return;
    out.push(`</${listType}>`);
    listType = null;
  };

  const closeCode = () => {
    if (!inCode) return;
    out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    inCode = false;
    codeLines = [];
  };

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (inCode) closeCode();
      else {
        closeList();
        inCode = true;
        codeLines = [];
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        out.push("<ul>");
      }
      out.push(`<li>${renderInline(unordered[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        out.push("<ol>");
      }
      out.push(`<li>${renderInline(ordered[1])}</li>`);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      out.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
      continue;
    }

    if (!line.trim()) {
      closeList();
      out.push('<div class="v39-doc-spacer"></div>');
      continue;
    }

    closeList();
    out.push(`<p>${renderInline(line)}</p>`);
  }

  closeCode();
  closeList();
  return out.join("");
}

function installStyles() {
  if (document.getElementById("v39-design-docs-style")) return;
  const style = document.createElement("style");
  style.id = "v39-design-docs-style";
  style.textContent = `
#v39-design-docs-modal{
  position:fixed;inset:0;z-index:12000;display:none;align-items:center;justify-content:center;
  padding:max(8px,var(--safe-t,0px)) max(8px,var(--safe-r,0px)) max(8px,var(--safe-b,0px)) max(8px,var(--safe-l,0px));
  background:rgba(1,5,8,.84);backdrop-filter:blur(3px);color:#e7eeee;
}
#v39-design-docs-modal.open{display:flex}
#v39-design-docs-modal .v39-doc-modal{
  width:min(1100px,100%);height:min(820px,100%);min-height:0;
  display:grid;grid-template-rows:48px minmax(0,1fr);
  overflow:hidden;border:1px solid #45575e;border-radius:10px;
  background:linear-gradient(180deg,#111c21,#081115);box-shadow:0 20px 60px rgba(0,0,0,.65);
}
#v39-design-docs-modal .v39-doc-head{
  display:flex;align-items:center;gap:10px;padding:7px 9px 7px 12px;
  border-bottom:1px solid #34454b;background:#142126;
}
#v39-design-docs-modal .v39-doc-head-title{min-width:0;flex:1}
#v39-design-docs-modal .v39-doc-head-title b{display:block;font-size:14px}
#v39-design-docs-modal .v39-doc-head-title span{display:block;margin-top:1px;color:#82959a;font-size:9px}
#v39-design-docs-modal .v39-doc-close{
  width:34px;height:32px;border:1px solid #485a61;border-radius:7px;background:#19272c;color:#e8efee;font-size:20px;cursor:pointer;
}
#v39-design-docs-modal .v39-doc-body{min-height:0;display:grid;grid-template-columns:250px minmax(0,1fr)}
#v39-design-docs-modal .v39-doc-sidebar{
  min-width:0;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:7px;padding:8px;
  border-right:1px solid #304147;background:rgba(5,12,15,.7);
}
#v39-design-docs-modal .v39-doc-search{
  width:100%;box-sizing:border-box;padding:8px 9px;border:1px solid #3d4e55;border-radius:7px;background:#101a1f;color:#e5edeb;outline:none;
}
#v39-design-docs-modal .v39-doc-search:focus{border-color:#6b858c}
#v39-design-docs-modal .v39-doc-list{min-height:0;overflow:auto;display:flex;flex-direction:column;gap:4px;scrollbar-width:none}
#v39-design-docs-modal .v39-doc-list::-webkit-scrollbar,#v39-design-docs-modal .v39-doc-reader::-webkit-scrollbar{display:none;width:0;height:0}
#v39-design-docs-modal .v39-doc-item{
  display:block;width:100%;padding:8px 9px;border:1px solid #304047;border-radius:7px;background:#111c21;color:#dbe6e4;text-align:left;cursor:pointer;
}
#v39-design-docs-modal .v39-doc-item:hover{border-color:#50646b;background:#17262b}
#v39-design-docs-modal .v39-doc-item.active{border-color:#6f8d95;background:#1b2c31;box-shadow:inset 3px 0 #7fa1aa}
#v39-design-docs-modal .v39-doc-item b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
#v39-design-docs-modal .v39-doc-item small{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#7f9297;font-size:8px}
#v39-design-docs-modal .v39-doc-main{min-width:0;min-height:0;display:grid;grid-template-rows:42px minmax(0,1fr)}
#v39-design-docs-modal .v39-doc-current{
  display:flex;align-items:center;gap:8px;padding:6px 11px;border-bottom:1px solid #2c3d43;background:#0e181c;
}
#v39-design-docs-modal .v39-doc-current strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
#v39-design-docs-modal .v39-doc-current code{margin-left:auto;color:#83979c;font-size:8px;white-space:nowrap}
#v39-design-docs-modal .v39-doc-reader{min-width:0;min-height:0;overflow:auto;padding:14px 18px 30px;line-height:1.7;scrollbar-width:none}
#v39-design-docs-modal .v39-doc-reader h1{font-size:21px;margin:4px 0 14px;padding-bottom:8px;border-bottom:1px solid #33454b}
#v39-design-docs-modal .v39-doc-reader h2{font-size:17px;margin:20px 0 9px;padding-bottom:5px;border-bottom:1px solid #2a3b41}
#v39-design-docs-modal .v39-doc-reader h3{font-size:14px;margin:17px 0 7px}
#v39-design-docs-modal .v39-doc-reader h4,#v39-design-docs-modal .v39-doc-reader h5,#v39-design-docs-modal .v39-doc-reader h6{font-size:12px;margin:14px 0 6px}
#v39-design-docs-modal .v39-doc-reader p{margin:3px 0;color:#c8d4d3;font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere}
#v39-design-docs-modal .v39-doc-reader ul,#v39-design-docs-modal .v39-doc-reader ol{margin:5px 0 8px;padding-left:22px;color:#c8d4d3;font-size:11px}
#v39-design-docs-modal .v39-doc-reader li{margin:2px 0}
#v39-design-docs-modal .v39-doc-reader blockquote{margin:8px 0;padding:7px 10px;border-left:3px solid #5f7b83;background:#101c20;color:#aebfbe;font-size:11px}
#v39-design-docs-modal .v39-doc-reader pre{max-width:100%;overflow:auto;padding:10px;border:1px solid #2f4249;border-radius:7px;background:#071014;color:#cdd9d7;font-size:10px;line-height:1.55}
#v39-design-docs-modal .v39-doc-reader code{padding:1px 4px;border-radius:4px;background:#101c21;color:#d7e5e3;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
#v39-design-docs-modal .v39-doc-reader pre code{padding:0;background:transparent}
#v39-design-docs-modal .v39-doc-reader strong{color:#eef4f2}
#v39-design-docs-modal .v39-doc-spacer{height:6px}
#v39-design-docs-modal .v39-doc-empty{display:grid;place-items:center;height:100%;min-height:160px;color:#71868b;text-align:center;font-size:11px}
@media(max-width:700px){
  #v39-design-docs-modal{padding:4px}
  #v39-design-docs-modal .v39-doc-modal{width:100%;height:100%;border-radius:7px;grid-template-rows:44px minmax(0,1fr)}
  #v39-design-docs-modal .v39-doc-body{grid-template-columns:1fr;grid-template-rows:minmax(150px,34%) minmax(0,1fr)}
  #v39-design-docs-modal .v39-doc-sidebar{border-right:0;border-bottom:1px solid #304147;padding:6px;gap:5px}
  #v39-design-docs-modal .v39-doc-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:4px}
  #v39-design-docs-modal .v39-doc-item{padding:6px 7px}
  #v39-design-docs-modal .v39-doc-main{grid-template-rows:36px minmax(0,1fr)}
  #v39-design-docs-modal .v39-doc-current{padding:5px 8px}
  #v39-design-docs-modal .v39-doc-current code{display:none}
  #v39-design-docs-modal .v39-doc-reader{padding:10px 10px 24px}
  #v39-design-docs-modal .v39-doc-reader h1{font-size:18px}
  #v39-design-docs-modal .v39-doc-reader h2{font-size:15px}
}
`;
  document.head.appendChild(style);
}

function waitForManagePanel() {
  return new Promise(resolve => {
    const poll = () => {
      const panel = document.getElementById("footManage");
      if (panel instanceof HTMLElement) resolve(panel);
      else window.setTimeout(poll, 40);
    };
    poll();
  });
}

function createViewer() {
  const overlay = document.createElement("div");
  overlay.id = "v39-design-docs-modal";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <section class="v39-doc-modal" role="dialog" aria-modal="true" aria-labelledby="v39-design-docs-title">
      <header class="v39-doc-head">
        <div class="v39-doc-head-title">
          <b id="v39-design-docs-title">設計書</b>
          <span>docs/ フォルダ内のMarkdownを表示</span>
        </div>
        <button type="button" class="v39-doc-close" aria-label="閉じる">×</button>
      </header>
      <div class="v39-doc-body">
        <aside class="v39-doc-sidebar">
          <input class="v39-doc-search" type="search" placeholder="設計書を検索" aria-label="設計書を検索">
          <div class="v39-doc-list"></div>
        </aside>
        <main class="v39-doc-main">
          <div class="v39-doc-current"><strong>設計書を選択</strong><code>docs/</code></div>
          <article class="v39-doc-reader"><div class="v39-doc-empty">左の一覧から設計書を選択してください</div></article>
        </main>
      </div>
    </section>
  `;
  document.body.appendChild(overlay);

  const list = overlay.querySelector(".v39-doc-list");
  const search = overlay.querySelector(".v39-doc-search");
  const title = overlay.querySelector(".v39-doc-current strong");
  const path = overlay.querySelector(".v39-doc-current code");
  const reader = overlay.querySelector(".v39-doc-reader");
  let selectedPath = "";

  const selectDoc = doc => {
    selectedPath = doc.path;
    if (title) title.textContent = doc.title;
    if (path) path.textContent = doc.path;
    if (reader) {
      reader.innerHTML = renderMarkdown(doc.text);
      reader.scrollTop = 0;
    }
    list?.querySelectorAll(".v39-doc-item").forEach(button => {
      button.classList.toggle("active", button.dataset.path === selectedPath);
    });
  };

  const renderList = query => {
    if (!list) return;
    const normalized = String(query || "").trim().toLowerCase();
    const filtered = DOCS.filter(doc => {
      if (!normalized) return true;
      return `${doc.title}\n${doc.path}`.toLowerCase().includes(normalized);
    });
    list.innerHTML = "";
    for (const doc of filtered) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "v39-doc-item";
      button.dataset.path = doc.path;
      button.innerHTML = `<b>${escapeHtml(doc.title)}</b><small>${escapeHtml(doc.path)}</small>`;
      button.addEventListener("click", () => selectDoc(doc));
      list.appendChild(button);
    }
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "v39-doc-empty";
      empty.textContent = "該当する設計書がありません";
      list.appendChild(empty);
    }
    list.querySelectorAll(".v39-doc-item").forEach(button => {
      button.classList.toggle("active", button.dataset.path === selectedPath);
    });
  };

  const close = () => {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  };
  const open = () => {
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    if (!selectedPath && DOCS.length) selectDoc(DOCS.find(doc => doc.path.endsWith("v39_ui_interaction_map.md")) || DOCS[0]);
  };

  search?.addEventListener("input", () => renderList(search.value));
  overlay.querySelector(".v39-doc-close")?.addEventListener("click", close);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && overlay.classList.contains("open")) close();
  });

  renderList("");
  return { open, close };
}

async function bootDesignDocsViewer() {
  installStyles();
  const managePanel = await waitForManagePanel();
  if (document.getElementById("v39-manage-design-docs")) return;

  const viewer = createViewer();
  const button = document.createElement("button");
  button.type = "button";
  button.id = "v39-manage-design-docs";
  button.className = "manage-tile";
  button.innerHTML = "<b>書</b><span>設計書</span>";
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    viewer.open();
  });
  managePanel.appendChild(button);

  window.openDesignDocsModal = viewer.open;
}

bootDesignDocsViewer().catch(error => {
  console.error("[v39-design-docs-viewer] boot failed", error);
});
