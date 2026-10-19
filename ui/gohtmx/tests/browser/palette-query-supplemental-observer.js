// Supplemental observation only: no focus, ARIA, scroll or value mutations.
(() => {
 const rect = node => { const r = node.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}; };
 const geometry = root => {
  const list=root.querySelector('[data-interaction-palette-results]'), input=root.querySelector('[data-interaction-palette] input');
  return {listID:list.id,inputID:input.id,viewport:{width:innerWidth,height:innerHeight,scrollX,scrollY},input:rect(input),
   list:{...rect(list),scrollTop:list.scrollTop,scrollHeight:list.scrollHeight,clientHeight:list.clientHeight,clientTop:list.clientTop,clientLeft:list.clientLeft,clientWidth:list.clientWidth},
   rows:[...list.querySelectorAll('[data-interaction-palette-option]')].map(row=>({id:row.id,value:row.value,...rect(row)}))};
 };
 window.paletteSupplementalSnapshot = () => ({...paletteSnapshot(),geometry:geometry(paletteRoot()),peerGeometry:geometry(paletteRoot('peer'))});
})();
