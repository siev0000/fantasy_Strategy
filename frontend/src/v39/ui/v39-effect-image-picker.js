import { resolveEffectSheetLayout } from "../../../../配布用/アニメーション再生機能/phaser-effect-player.mjs";
import { getV39EffectImageSource } from "../combat/v39-effect-player.js";

let gallery;

export function syncEffectImagePicker() {
  if (!gallery) return;
  const selected = document.getElementById("v39-effect-setting-base").value;
  for (const button of gallery.querySelectorAll("[data-effect-image]")) {
    button.setAttribute("aria-pressed", String(button.dataset.effectImage === selected));
  }
}

export function installEffectImagePicker() {
  const select = document.getElementById("v39-effect-setting-base");
  const row = select.closest(".v39-effect-setting-row");
  row.classList.add("v39-effect-image-picker");
  const heading = document.createElement("div");
  heading.className = "v39-effect-image-picker-head";
  heading.appendChild(row.querySelector("span"));
  for (const [mode, name] of [["list", "リスト"], ["images", "画像一覧"]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.effectPickerMode = mode;
    button.textContent = name;
    button.setAttribute("aria-pressed", String(mode === "list"));
    heading.appendChild(button);
  }
  row.prepend(heading);
  gallery = document.createElement("div");
  gallery.id = "v39-effect-image-gallery";
  gallery.hidden = true;
  row.appendChild(gallery);

  let mounted = false;
  function mountImages() {
    if (mounted) return;
    mounted = true;
    const queue = [];
    let running = 0;
    // 大きなシートを一括展開せず、見えているカードだけ最大4枚ずつ読み込む。
    function drain() {
      while (queue.length && running < 4) {
        const button = queue.shift();
        const source = getV39EffectImageSource(button.dataset.effectImage);
        const image = new Image();
        running += 1;
        image.onload = () => {
          const layout = resolveEffectSheetLayout(image.width, image.height);
          const frame = Math.floor(layout.frameCount / 2);
          const canvas = button.querySelector("canvas");
          const scale = Math.min(canvas.width / layout.frameWidth, canvas.height / layout.frameHeight);
          const width = layout.frameWidth * scale, height = layout.frameHeight * scale;
          canvas.getContext("2d").drawImage(image,
            layout.horizontal ? frame * layout.frameWidth : 0,
            layout.horizontal ? 0 : frame * layout.frameHeight,
            layout.frameWidth, layout.frameHeight,
            (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
          button.dataset.thumbnail = "ready";
          running -= 1;
          drain();
        };
        image.onerror = () => { button.dataset.thumbnail = "error"; running -= 1; drain(); };
        image.src = source.src;
      }
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        queue.push(entry.target);
      }
      drain();
    }, { root:gallery });
    for (const option of select.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.effectImage = option.value;
      button.setAttribute("aria-label", `基本形状：${option.textContent}`);
      const canvas = document.createElement("canvas");
      canvas.width = 192; canvas.height = 144;
      const name = document.createElement("span");
      name.textContent = option.textContent;
      button.append(canvas, name);
      gallery.appendChild(button);
      observer.observe(button);
    }
    syncEffectImagePicker();
  }
  heading.addEventListener("click", event => {
    const button = event.target.closest("[data-effect-picker-mode]");
    if (!button) return;
    const images = button.dataset.effectPickerMode === "images";
    select.hidden = images;
    gallery.hidden = !images;
    for (const control of heading.querySelectorAll("button")) control.setAttribute("aria-pressed", String(control === button));
    if (images) mountImages();
  });
  gallery.addEventListener("click", event => {
    const button = event.target.closest("[data-effect-image]");
    if (!button) return;
    select.value = button.dataset.effectImage;
    select.dispatchEvent(new Event("change", { bubbles:true }));
    syncEffectImagePicker();
  });
  select.addEventListener("change", syncEffectImagePicker);
}
