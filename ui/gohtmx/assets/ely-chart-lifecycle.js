const charts = new Set();
let observer;

// Supports both htmx cleanup events and hosts that replace DOM without them.
export function watchChart(root, content, destroy) {
  const entry = {root, content, destroy, connected: root.isConnected};
  charts.add(entry);
  if (!observer && typeof MutationObserver === 'function') {
    observer = new MutationObserver(() => {
      for (const item of charts) {
        if (item.root.isConnected) {
          item.connected = true;
          if (!item.root.contains(item.content)) item.destroy();
        } else if (item.connected) item.destroy();
      }
    });
    observer.observe(document.documentElement, {childList: true, subtree: true});
  }
  return () => {
    charts.delete(entry);
    if (!charts.size && observer) { observer.disconnect(); observer = null; }
  };
}
