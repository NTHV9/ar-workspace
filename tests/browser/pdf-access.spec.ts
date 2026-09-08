import {test,expect} from '@playwright/test';
test('private validation PDF and metadata require a verified session',async({request,page})=>{
 for(const ext of ['pdf','json']){
  const path=`/api/pdf-validation/00000000-0000-4000-8000-000000000000/KAT/${ext}`;
  expect((await request.get(path)).status()).toBe(401);
  expect((await request.get(path,{headers:{Authorization:'Bearer invalid'}})).status()).toBe(401);
 }
 await page.goto('/?pdfCheck=00000000-0000-4000-8000-000000000000&pdfHotel=KAT');
 await expect(page.getByRole('heading',{name:'Your AR workspace'})).toBeVisible();
 await expect(page.locator('.native-pdf-pages')).toHaveCount(0);
});
