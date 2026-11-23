import {audioCatalog,getGameAudioController} from "../../lib/audio-player.js";
import "./v39-audio-settings.css";

const volumeFields = [
  ["masterVolume","全体音量","setMasterVolume"],
  ["bgmVolume","BGM音量","setBgmVolume"],
  ["seVolume","SE音量","setSeVolume"]
];
const soundFields = [
  ["BGM","bgm",[["title","タイトル"],["field","フィールド"]]],
  ["SE","se",[["open","開く"],["confirm","決定"],["cancel","戻る"],
    ["change","切り替え"],["namedWeapon","ネームド武器生成"]]]
];

export function openV39AudioSettings() {
  if (document.getElementById("v39-audio-settings")) return;
  const audio = getGameAudioController();
  const dialog = document.createElement("dialog");
  dialog.id = "v39-audio-settings";
  dialog.setAttribute("aria-labelledby","v39-audio-settings-title");
  dialog.innerHTML = `
    <header>
      <h2 id="v39-audio-settings-title">音設定</h2>
      <button type="button" data-audio-close>閉じる</button>
    </header>
    <div class="v39-audio-settings-body">
      <fieldset><legend>音量</legend>
        ${volumeFields.map(([key,label])=>`<div class="v39-audio-volume">
          <label for="v39-audio-volume-${key}">${label}</label>
          <input id="v39-audio-volume-${key}" type="range" min="0" max="100">
          <output for="v39-audio-volume-${key}"></output>
        </div>`).join("")}
      </fieldset>
      ${soundFields.map(([legend,kind,entries])=>`<fieldset><legend>${legend}</legend>
        ${entries.map(([key,label])=>`<div class="v39-audio-selection">
          <label for="v39-audio-${kind}-${key}">${label}</label>
          <select id="v39-audio-${kind}-${key}"></select>
          <button type="button" data-audio-se="off" aria-label="${label}の音を試聴">試聴</button>
        </div>`).join("")}
      </fieldset>`).join("")}
    </div>
    <footer>
      <output data-audio-status role="status"></output>
      <button type="button" data-audio-stop data-audio-se="off">試聴停止</button>
    </footer>`;

  const volumes = audio.getVolumeSettings();
  for (const [key,,setter] of volumeFields) {
    const input = dialog.querySelector(`#v39-audio-volume-${key}`);
    const output = input.nextElementSibling;
    input.value = Math.round(volumes[key]*100);
    output.textContent = `${input.value}%`;
    input.addEventListener("input",()=>{
      output.textContent = `${input.value}%`;
      audio[setter](Number(input.value)/100);
    });
  }

  const status = dialog.querySelector("[data-audio-status]");
  for (const [,kind,entries] of soundFields) {
    for (const [key] of entries) {
      const select = dialog.querySelector(`#v39-audio-${kind}-${key}`);
      const preview = select.nextElementSibling;
      select.add(new Option("無音",""));
      for (const choice of audioCatalog[kind]) select.add(new Option(choice.label,choice.id));
      select.value = audio.getSoundSelection(kind,key);
      preview.disabled = !select.value;
      select.addEventListener("change",()=>{
        audio.setSoundSelection(kind,key,select.value);
        audio.stopPreview();
        preview.disabled = !select.value;
        status.textContent = "";
      });
      preview.addEventListener("click",async()=>{
        status.textContent = "";
        if (!await audio.previewSound(kind,select.value) && dialog.open) {
          status.textContent = "音源を試聴できませんでした。";
        }
      });
    }
  }
  dialog.querySelector("[data-audio-stop]").addEventListener("click",()=>{
    audio.stopPreview();
    status.textContent = "";
  });
  dialog.querySelector("[data-audio-close]").addEventListener("click",()=>dialog.close());
  dialog.addEventListener("keydown",event=>{ if (event.key === "Escape") event.stopPropagation(); });
  dialog.addEventListener("close",()=>{
    audio.stopPreview();
    dialog.remove();
  },{once:true});
  document.body.append(dialog);
  dialog.showModal();
}
