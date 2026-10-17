import assert from 'node:assert/strict';

export async function selectFusionMaterial(page,index,id){
  await page.locator(`[data-fusion-slot="${index}"]`).click();
  const target=page.locator(`[data-fusion-candidate="${id}"]`);
  await target.click();
  assert(!await page.locator('[data-fusion-choose]').isDisabled(),`${id} is eligible for slot ${index}`);
  await page.locator('[data-fusion-choose]').click();
}

export async function fusionCandidateIds(page,index){
  await page.locator(`[data-fusion-slot="${index}"]`).click();
  return page.locator('.fusion-candidate:not(.unavailable) [data-fusion-candidate]').evaluateAll(rows=>rows.map(row=>row.dataset.fusionCandidate));
}
