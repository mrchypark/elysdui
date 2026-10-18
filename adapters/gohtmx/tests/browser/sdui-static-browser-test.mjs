import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('dist'), siteBase='/elysdui/', base=siteBase+'go-htmx/', errors=[], bad=[];
const server=createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(!p.startsWith(siteBase)){res.writeHead(404).end();return;}p=p.slice(siteBase.length);if(!p||p.endsWith('/'))p+='index.html';const file=resolve(root,p);if(!file.startsWith(root+'/'))throw Error('path');const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(origin+siteBase))return route.continue();bad.push(u);return route.abort();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)bad.push(`${r.status()} ${r.url()}`);});
 // One identity across project hub, gallery and playground, in both themes.
 await mkdir('test-results/static-pages',{recursive:true});
 for (const theme of ['light','dark']) {
  for (const [surface,url] of [['hub',siteBase],['gallery',base],['playground',base+'playground/']]) {
   await page.goto(origin+url);
   if(await page.locator('html').getAttribute('data-theme')!==theme) await page.locator('[data-theme-toggle]').click();
   assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
   if(surface==='playground') {
    await page.waitForFunction(()=>document.querySelector('#preview-state').textContent==='Live · validated');
    const frame=page.frameLocator('#preview-frame');
    await frame.locator(`html[data-theme="${theme}"]`).waitFor();
    await frame.getByText('Build something useful.',{exact:true}).waitFor({state:'visible'});
    const rendered=await frame.locator('body').evaluate(el=>({font:getComputedStyle(el).fontFamily, background:getComputedStyle(el.ownerDocument.documentElement).backgroundColor,color:getComputedStyle(el).color}));
    assert(rendered.font.includes('Inter')&&rendered.font.includes('sans-serif'),'preview retains the shared sans-serif stack');
    assert.equal(rendered.background,theme==='dark'?'rgb(37, 37, 37)':'rgb(252, 250, 247)');
    assert.equal(rendered.color,theme==='dark'?'rgb(243, 241, 240)':'rgb(24, 22, 19)');
    assert.equal(await page.locator('#preview-frame').getAttribute('sandbox'),'');
    assert.equal(await page.locator('#preview-frame').evaluate(el=>getComputedStyle(el).backgroundColor),theme==='dark'?'rgb(37, 37, 37)':'rgb(252, 250, 247)','iframe gutter shares the paper token');
   }
   assert.equal(await page.locator('.project-origin').innerText(),'Independent project inspired by Ely GPUI. Not affiliated with or endorsed by Ely GPUI.');
   assert.equal(await page.locator('.project-origin a').getAttribute('href'),'https://elygpui.com/');
   assert((await page.locator('link[rel=icon]').getAttribute('href')).endsWith('elysdui-mark.svg'));
   const brand=page.locator('header .brand-mark');
   assert.equal(await brand.count(),1);
   const visual=await brand.evaluate(el=>({mask:getComputedStyle(el).maskImage,color:getComputedStyle(el).backgroundColor}));
   assert(visual.mask.includes('elysdui-mark.svg'));
   assert.equal(visual.color,theme==='light'?'rgb(24, 22, 19)':'rgb(243, 241, 240)');
   for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    await page.evaluate(()=>document.fonts.ready);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`${surface} fits ${width}`);
    await page.screenshot({path:`test-results/static-pages/identity-${surface}-${theme}-${width}.png`,animations:'disabled'});
   }
  }
 }
 await page.locator('[data-theme-toggle]').click();
 await page.goto(origin+siteBase);
 assert.equal(await page.locator('html').getAttribute('data-theme'),'light','theme persists across surfaces');
 assert.equal(await page.title(),'elysdui — One definition. Native possibilities.');
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 assert.deepEqual(await page.locator('#renderers h3').allTextContents(),['Go / HTMX','SwiftUI','Jetpack Compose','Ely / GPUI']);
 await mkdir('test-results/static-pages',{recursive:true});
 for(const width of [1440,768,390]) {
  await page.setViewportSize({width,height:1000});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'hub fits viewport');
  await page.screenshot({path:`test-results/static-pages/hub-${width}.png`,fullPage:true,animations:'disabled'});
 }
 await page.getByRole('link',{name:'Explore the web gallery'}).click();
 assert.equal(page.url(),origin+base);
 await page.goBack();
 await page.getByRole('link',{name:'Open playground',exact:false}).click();
 assert.equal(page.url(),origin+base+'playground/');
 await page.waitForFunction(()=>globalThis.elyRendererMetrics,{},{timeout:120000});
 await page.goBack();
 assert.equal(page.url(),origin+siteBase);
 await page.goto(origin+base);assert((await page.locator('a').count())>40,'gallery links rendered');
 const expectedNav=['Components','Form examples','Themes','Playground'];
 const chrome=async()=>page.locator('.site-header').evaluate(el=>({background:getComputedStyle(el).backgroundColor,font:getComputedStyle(el).fontFamily,brand:el.querySelector('.wordmark').textContent.trim()}));
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 assert.deepEqual(await page.locator('.header-nav a').allTextContents(),expectedNav);
 const galleryChrome=await chrome();
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));}
 await page.goto(origin+base+'playground/');await page.waitForFunction(()=>globalThis.elyRendererMetrics,{},{timeout:120000});
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 assert.deepEqual(await page.locator('.header-nav a').allTextContents(),expectedNav);
 assert.deepEqual(await chrome(),galleryChrome);
 assert.equal(await page.locator('.header-nav [aria-current=page]').textContent(),'Playground');
 for(const url of await page.locator('link[rel=stylesheet],script[src]').evaluateAll(nodes=>nodes.map(el=>el.getAttribute('href')||el.getAttribute('src')))){assert(/\?v=[a-f0-9]{16}$/.test(url),'cache-safe asset: '+url);}
 await mkdir('test-results/static-pages',{recursive:true});
 await page.setViewportSize({width:1440,height:1000});await page.waitForFunction(()=>document.querySelector('#preview-state').textContent==='Live · validated');
 await page.screenshot({path:'test-results/static-pages/welcome-desktop.png',fullPage:true,animations:'disabled'});
 await page.locator('[data-theme-toggle]').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.frameLocator('#preview-frame').locator('html[data-theme=dark]').waitFor();
 await page.frameLocator('#preview-frame').getByText('Build something useful.',{exact:true}).waitFor({state:'visible'});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.screenshot({path:'test-results/static-pages/welcome-dark.png',fullPage:true,animations:'disabled'});
 // A click can resolve once navigation commits, before the new head's theme script runs.
 // Wait for the destination document, then check restoration without polling the expected value.
 await Promise.all([
  page.waitForURL(origin+base+'components/usage/',{waitUntil:'domcontentloaded'}),
  page.locator('.header-nav a').filter({hasText:'Form examples'}).click(),
 ]);
 assert.equal(await page.locator('.header-nav [aria-current=page]').textContent(),'Form examples');
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 assert.equal(await page.locator('[data-theme-toggle]').getAttribute('aria-pressed'),'true');
 await page.goBack();await page.waitForFunction(()=>globalThis.elyRendererMetrics,{},{timeout:120000});
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.locator('[data-theme-toggle]').click();
 await page.setViewportSize({width:1440,height:1000});
 const screen={version:'1',id:'static-test',root:{id:'layout',type:'stack',children:[{id:'message',type:'text',props:{text:'Static WASM preview'}}]}};
 await page.locator('#tab-screen').click();await page.locator('#screen-editor').fill(JSON.stringify(screen));await page.locator('#screen-editor').press('Control+Enter');
 await page.waitForFunction(()=>document.querySelector('#preview-frame').srcdoc.includes('Static WASM preview'));
 assert.equal(await page.locator('#preview-frame').getAttribute('sandbox'),'');
 const measured=await page.evaluate(async screen=>elyStaticAPI('/api/preview',{body:JSON.stringify({screen,data:{},profile:'static',strategy:'smallest'})}),screen);
 for(const coding of ['identity','gzip','br','zstd'])assert(measured.sizes.html[coding]>0);
 await page.locator('#screen-editor').fill('{broken');await page.locator('#screen-editor').press('Control+Enter');await page.waitForFunction(()=>document.querySelector('#validation-message').textContent.trim());
 assert((await page.locator('#preview-frame').getAttribute('srcdoc')).includes('Static WASM preview'));
 await page.locator('#screen-editor').fill(JSON.stringify(screen));await page.locator('#screen-editor').press('Control+Enter');
 await page.locator('#node-tree [data-node-path]').last().click();await page.locator('#node-duplicate').click();assert.equal(JSON.parse(await page.locator('#screen-editor').inputValue()).root.children.length,2);
 await page.locator('#undo').click();assert.equal(JSON.parse(await page.locator('#screen-editor').inputValue()).root.children.length,1);
 await page.waitForFunction(()=>document.querySelector('#preview-state').textContent==='Live · validated');
 await mkdir('test-results/static-pages',{recursive:true});await page.screenshot({path:'test-results/static-pages/desktop.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
 // Paint the below-the-fold frame before capturing the full mobile document.
 await page.locator('#preview-frame').scrollIntoViewIfNeeded();
 await page.frameLocator('#preview-frame').getByText('Static WASM preview',{exact:true}).waitFor({state:'visible'});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.locator('#preview-frame').screenshot({path:'test-results/static-pages/mobile-preview.png',animations:'disabled'});
 await page.screenshot({path:'test-results/static-pages/mobile.png',fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);console.log('Static gallery and real WASM editor passed',await page.evaluate(()=>elyRendererMetrics));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
