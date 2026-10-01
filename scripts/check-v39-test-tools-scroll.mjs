import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:524, height:760 }, isMobile:true, hasTouch:true });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
  await page.waitForFunction(() => (
    typeof window.startV39LocalSession === "function"
    && typeof window.openV39TestTools === "function"
  ));
  const report = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    document.querySelector("#v39-play-mode-select")?.remove();
    document.querySelectorAll(".vue-modal-backdrop").forEach(element => element.remove());
    window.setV39TestMode?.(true);
    window.openV39TestTools?.();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const scroll = document.querySelector(".v39-test-tools-scroll");
    const button = document.querySelector('[data-test-action="hp-minus"]');
    if (!(scroll instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) {
      throw new Error("テスト操作UIを取得できません");
    }
    scroll.scrollTop = Math.min(420, scroll.scrollHeight - scroll.clientHeight);
    const before = scroll.scrollTop;
    button.click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const nextScroll = document.querySelector(".v39-test-tools-scroll");
    return {
      before,
      after:nextScroll instanceof HTMLElement ? nextScroll.scrollTop : -1,
      scrollHeight:nextScroll?.scrollHeight,
      clientHeight:nextScroll?.clientHeight,
      status:document.querySelector("#v39-test-tools-status")?.textContent
    };
  });
  await page.screenshot({ path:"output/web-game/v39-test-tools-scroll.png", fullPage:false });
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (errors.length || report.before < 100 || Math.abs(report.after - report.before) > 1) process.exitCode = 1;
} finally {
  await browser.close();
}
