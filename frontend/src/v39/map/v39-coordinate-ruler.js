import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import "./v39-coordinate-ruler.css";

// 目盛りの最小間隔。縮小表示では番号を間引いて重なりを避ける。
const MIN_LABEL_GAP = 28;
export function installV39CoordinateRuler(scene, host, map) {
  host.querySelector("#v39-coordinate-ruler")?.remove();
  const root = document.createElement("div");
  root.id = "v39-coordinate-ruler";
  root.setAttribute("aria-hidden", "true");
  host.appendChild(root);
  let previous = "";
  const update = () => {
    const enabled = window.getV39DisplaySettings?.().showCoordinateRuler !== false;
    root.hidden = !enabled;
    if (!enabled) { previous = ""; return; }
    const camera = scene.cameras.main;
    const parity = (scene.v39SelectedTile?.y || 0) % 2;
    const key = [camera.scrollX,camera.scrollY,camera.zoom,camera.width,camera.height,
      scene.v39SelectedTile?.x,scene.v39SelectedTile?.y].join(":");
    if (key === previous) return;
    previous = key;
    camera.preRender();
    const origin = camera.getWorldPoint(0,0);
    const { width, height, rowStep, oddRowOffsetX } = HEX_TILE_CONFIG;
    const stepX = Math.max(1,Math.ceil(MIN_LABEL_GAP / (width * camera.zoom)));
    const stepY = Math.max(1,Math.ceil(MIN_LABEL_GAP / (rowStep * camera.zoom)));
    const labels = [];
    const add = (axis,value,position,selected) => {
      const label = document.createElement("span");
      label.className = `v39-coordinate-${axis}${selected ? " selected" : ""}`;
      label.dataset.coordinate = String(value);
      label.textContent = String(value);
      label.style[axis === "x" ? "left" : "top"] = `${position}px`;
      labels.push(label);
    };
    for (let x=0;x<map.w;x++) {
      const selected = scene.v39SelectedTile?.x === x;
      if (x % stepX && !selected) continue;
      if (!selected && Math.abs(x - scene.v39SelectedTile?.x)*width*camera.zoom < MIN_LABEL_GAP) continue;
      const pos = (x*width + width/2 + parity*oddRowOffsetX - origin.x)*camera.zoom;
      if (pos >= 14 && pos < camera.width-65) add("x",x,pos,selected);
    }
    for (let y=0;y<map.h;y++) {
      const selected = scene.v39SelectedTile?.y === y;
      if (y % stepY && !selected) continue;
      if (!selected && Math.abs(y - scene.v39SelectedTile?.y)*rowStep*camera.zoom < MIN_LABEL_GAP) continue;
      const pos = (y*rowStep + height/2 - origin.y)*camera.zoom;
      if (pos >= 14 && pos < camera.height-65) add("y",y,pos,selected);
    }
    root.replaceChildren(...labels);
  };
  scene.events.on("postupdate",update);
  window.addEventListener("v39:display-settings-changed",update);
  const dispose = () => {
    scene.events.off("shutdown",dispose);
    scene.events.off("destroy",dispose);
    scene.events.off("postupdate",update);
    window.removeEventListener("v39:display-settings-changed",update);
    root.remove();
  };
  scene.events.once("shutdown",dispose);
  scene.events.once("destroy",dispose);
  update();
  return dispose;
}
