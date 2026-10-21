export async function openV39TestSuite(page,suite){
  const section=page.locator('[data-test-section=expedition]');
  if(!await section.evaluate(element=>element.open))await section.locator(':scope > summary').click();
  const group=page.locator(`[data-test-suite=${suite}]`);
  if(!await group.evaluate(element=>element.open))await group.locator(':scope > summary').click();
}
