// Runs in the page. Include painted descendant/text overflow, but respect CSS clipping.
export function captureBounds(element) {
  const rect = r => ({left: r.left, top: r.top, right: r.right, bottom: r.bottom});
  const root = rect(element.getBoundingClientRect());
  let bounds = {...root}, visibleCount = 0, clippedCount = 0;
  const include = (node, box, text = false) => {
    if (!(box.right > box.left && box.bottom > box.top)) return;
    for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || style.contentVisibility === 'hidden') return;
      if (ancestor === node && !text) continue;
      const area = ancestor.getBoundingClientRect();
      const prior = {...box};
      if (style.overflowX !== 'visible') {
        box.left = Math.max(box.left, area.left + ancestor.clientLeft);
        box.right = Math.min(box.right, area.left + ancestor.clientLeft + ancestor.clientWidth);
      }
      if (style.overflowY !== 'visible') {
        box.top = Math.max(box.top, area.top + ancestor.clientTop);
        box.bottom = Math.min(box.bottom, area.top + ancestor.clientTop + ancestor.clientHeight);
      }
      if (box.left !== prior.left || box.right !== prior.right || box.top !== prior.top || box.bottom !== prior.bottom) clippedCount++;
      if (!(box.right > box.left && box.bottom > box.top)) return;
    }
    visibleCount++;
    bounds = {left: Math.min(bounds.left, box.left), top: Math.min(bounds.top, box.top), right: Math.max(bounds.right, box.right), bottom: Math.max(bounds.bottom, box.bottom)};
  };
  for (const node of [element, ...element.querySelectorAll('*')]) {
    include(node, rect(node.getBoundingClientRect()));
    for (const text of node.childNodes) {
      if (text.nodeType !== Node.TEXT_NODE || !text.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const part of range.getClientRects()) include(node, rect(part), true);
    }
  }
  const left = Math.max(0, Math.floor(bounds.left + scrollX));
  const top = Math.max(0, Math.floor(bounds.top + scrollY));
  const right = Math.ceil(bounds.right + scrollX), bottom = Math.ceil(bounds.bottom + scrollY);
  return {
    clip: {x: left, y: top, width: right - left, height: bottom - top},
    root, visibleCount, clippedCount,
    extendsRoot: bounds.left < root.left - 0.5 || bounds.right > root.right + 0.5 || bounds.top < root.top - 0.5 || bounds.bottom > root.bottom + 0.5,
    viewportTruncated: bounds.left < 0 || bounds.top < 0 || bounds.right > innerWidth || bounds.bottom > innerHeight,
    negativePageOverflow: bounds.left + scrollX < 0 || bounds.top + scrollY < 0,
  };
}
