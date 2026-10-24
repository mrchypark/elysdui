export async function goBackTo(page, target, label) {
 const from=page.url();
 try {
  await Promise.all([
   page.waitForURL(target,{waitUntil:'domcontentloaded'}),
   page.goBack({waitUntil:'domcontentloaded'}),
  ]);
 } catch(error) {
  throw new Error(`${label}: Back from ${from} did not reach ${target}; current URL is ${page.url()}`,{cause:error});
 }
 if(page.url()!==target) throw new Error(`${label}: Back from ${from} ended at ${page.url()}, expected ${target}`);
}
