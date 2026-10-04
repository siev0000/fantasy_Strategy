import "./v39-cave-world.js";

let pending = false;
let activeApp = null;

// Vueは生成確認と探索準備だけ。開始後は通常ゲームの状態・画面へ渡してアンマウントする。
window.addEventListener("v39:cave-test-requested", async () => {
  if (pending || activeApp) return;
  pending = true;
  try {
    const [{ createApp }, { default: CaveTestModal }] = await Promise.all([
      import("vue"), import("../../components/CaveTestModal.vue"),
    ]);
    const host = document.createElement("div");
    host.id = "v39-cave-test-host";
    document.body.appendChild(host);
    const close = () => { activeApp?.unmount(); activeApp=null; host.remove(); window.openV39PlayModeSelection?.(); };
    const started=()=>{activeApp?.unmount();activeApp=null;host.remove();};
    activeApp=createApp(CaveTestModal,{show:true,onClose:close,onStarted:started});
    activeApp.mount(host);
  } catch (error) {
    console.error("[洞窟テスト]",error);
    window.openV39PlayModeSelection?.();
  } finally { pending=false; }
});
