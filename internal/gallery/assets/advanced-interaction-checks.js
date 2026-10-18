import {registerChecks, assert, waitFor} from './advanced-checks.js';

const stories = {
  buttons: ['Button','Sizes','With icons','Icon button','ShortcutHint','ButtonGroup','SplitButton','ToggleButton','ToggleGroup','SegmentedControl','FloatingActionButton','ConfirmButton','CopyButton','ActionBar','BulkActionBar','ActionSheet','QuickActions'],
  navigation: ['Tabs','EditorTabs','Breadcrumb','Pagination','Steps','Sidebar Navigation','NavigationMenu','BackForwardNavigation','Anchor','JumpTo','CommandPalette','QuickOpen','QuickSwitcher','SearchPalette'],
  menus: ['Menu','CheckboxMenuItem','DropdownMenu','ContextMenu','MenuBar Menu','MegaMenu','SearchableMenu','PieMenu'],
  overlays: ['Popover','HoverCard','Dialog','Lightbox','Spotlight','FloatingToolbar','Callout','Tooltip'],
  feedback: ['Toast','Notification','Alert','Banner','Callout','InlineMessage','EmptyState','ErrorView','ErrorBoundary','Result','ConfirmationCard','SavingIndicator','Countdown'],
  motion: ['Spinner','Skeleton','Shimmer','LoadingButton','LoadMore','ProgressBar','LoadingOverlay','LazyLoad','Suspense','RefreshIndicator','UploadList','Transition','Stagger','AnimatePresence','Flip','Reorder','Marquee','Ripple','Glow','Blink','ParticleBackground'],
  interaction: ['Draggable','Resizable','LongPress','Hotkeys','Undo','VirtualScroller','Autofocus'],
};

const contracts = {
  buttons: {
    'Button':'[data-ely-action="primary"]','Sizes':'[data-ely-action="press"]','With icons':'[data-ely-action="new-file"]','Icon button':'button[aria-label]','ShortcutHint':'.ely-interaction__shortcut','ButtonGroup':'[data-interaction-select]','SplitButton':'[data-interaction-menu]','ToggleButton':'[data-interaction-toggle]','ToggleGroup':'[data-interaction-toggle]','SegmentedControl':'[data-interaction-choice]','FloatingActionButton':'.ely-interaction__fab','ConfirmButton':'[data-interaction-hold]','CopyButton':'[data-ely-action="copy"]','ActionBar':'.ely-interaction__bar [data-ely-action]' ,'BulkActionBar':'[data-interaction-bulk]','ActionSheet':'[data-interaction-dialog]','QuickActions':'.ely-interaction__quick [data-ely-action]'
  },
  navigation: {
    'Tabs':'[role="tab"]','EditorTabs':'[data-interaction-tab]','Breadcrumb':'.ely-interaction__breadcrumb','Pagination':'[data-interaction-page]','Steps':'.ely-interaction__steps','Sidebar Navigation':'.ely-interaction__nav a','NavigationMenu':'.ely-interaction__navigation-menu [data-interaction-menu]','BackForwardNavigation':'[data-ely-action="back"]','Anchor':'.ely-interaction__toc a','JumpTo':'form[data-ely-submit="jump"]','CommandPalette':'[data-interaction-dialog]','QuickOpen':'[data-interaction-dialog]','QuickSwitcher':'[data-interaction-dialog]','SearchPalette':'[data-interaction-dialog]'
  },
  menus: {
    'Menu':'[role="menu"]','CheckboxMenuItem':'[role="menuitemcheckbox"]','DropdownMenu':'[data-interaction-menu]','ContextMenu':'[data-interaction-context]','MenuBar Menu':'nav [data-interaction-menu]','MegaMenu':'.ely-interaction__mega .ely-interaction__navigation-menu [data-interaction-menu]','SearchableMenu':'[data-interaction-filter]','PieMenu':'.ely-interaction__pie [role="menuitem"]'
  },
  overlays: {
    'Popover':'[data-interaction-popover][role="dialog"]','HoverCard':'[data-interaction-hover-panel][role="region"]','Dialog':'dialog','Lightbox':'.ely-interaction__lightbox-gallery [data-interaction-lightbox-open]','Spotlight':'.ely-interaction__spotlight','FloatingToolbar':'[role="toolbar"]','Callout':'.ely-interaction__callout','Tooltip':'[role="tooltip"]'
  },
  feedback: {
    'Toast':'.ely-interaction__toast','Notification':'.ely-interaction__notification','Alert':'.ely-interaction__alert','Banner':'.ely-interaction__banner','Callout':'.ely-interaction__callout','InlineMessage':'.ely-interaction__message','EmptyState':'.ely-interaction__empty-grid','ErrorView':'.ely-interaction__error','ErrorBoundary':'.ely-interaction__error','Result':'.ely-interaction__result','ConfirmationCard':'.ely-interaction__confirmation','SavingIndicator':'.ely-interaction__saving','Countdown':'[data-interaction-countdown]'
  },
  motion: {
    'Spinner':'.ely-interaction__spinner','Skeleton':'.ely-interaction__skeleton','Shimmer':'.ely-interaction__shimmer','LoadingButton':'[data-interaction-loading]','LoadMore':'[data-interaction-more]','ProgressBar':'[role="progressbar"]','LoadingOverlay':'.ely-interaction__loading','LazyLoad':'[data-interaction-lazy]','Suspense':'[aria-busy]','RefreshIndicator':'[data-interaction-refresh]','UploadList':'.ely-interaction__uploads.ely-interaction__items','Transition':'[data-interaction-transition]','Stagger':'[data-interaction-stagger]','AnimatePresence':'[data-interaction-presence]','Flip':'[data-interaction-flip]','Reorder':'[data-interaction-reorder]','Marquee':'.ely-interaction__marquee','Ripple':'[data-interaction-ripple]','Glow':'.ely-interaction__glow','Blink':'.ely-interaction__blink','ParticleBackground':'.ely-interaction__particles, [data-interaction-lottie]'
  },
  interaction: {
    'Draggable':'[data-interaction-draggable]','Resizable':'[data-interaction-resizable]','LongPress':'[data-interaction-longpress]','Hotkeys':'[data-interaction-hotkeys]','Undo':'[data-interaction-undo]','VirtualScroller':'[data-interaction-scroller]','Autofocus':'[data-interaction-roving]'
  },
};

const requires = {
  filter: new Set(['navigation/CommandPalette','menus/SearchableMenu']),
  toggle: new Set(['buttons/ToggleButton','buttons/ToggleGroup','overlays/FloatingToolbar']),
  choice: new Set(['buttons/SegmentedControl']),
  tab: new Set(['navigation/Tabs','navigation/EditorTabs']),
  menu: new Set(['buttons/SplitButton','menus/Menu','menus/DropdownMenu','menus/ContextMenu','menus/MenuBar Menu','overlays/Popover']),
  dialog: new Set(['buttons/ActionSheet','navigation/CommandPalette','navigation/QuickOpen','navigation/QuickSwitcher','navigation/SearchPalette','overlays/Dialog','overlays/Lightbox']),
  wizard: new Set(['navigation/Steps']), sidebar: new Set(['navigation/Sidebar Navigation']),
  resize: new Set(['interaction/Resizable']), undo: new Set(['interaction/Undo']), hotkeys: new Set(['interaction/Hotkeys']),
  ripple: new Set(['motion/Ripple']), reorder: new Set(['motion/Reorder']), hold: new Set(['buttons/ConfirmButton','interaction/LongPress']),
  lightbox: new Set(['overlays/Lightbox']), motionControl: new Set(['motion/Stagger','motion/Flip']),
  form: new Set(['navigation/JumpTo','navigation/QuickOpen','navigation/SearchPalette']),
  dialogAction: new Set(['overlays/Dialog']),
};

const check = async ({root,expectError}, selector) => {
  const key = root.dataset.elyComponent;
  const need = (name, node) => { if (requires[name]?.has(key)) assert(node, `${key} is missing its ${name} control`); return node; };
  const emitted = [];
  const changes = [];
  root.addEventListener('ely:action', event => emitted.push(event.detail));
  root.addEventListener('ely:change', event => changes.push(event.detail));
  assert(root.dataset.elyReady === 'true', 'interaction root did not mount');
  if (root.querySelector('[data-interaction-lottie]')) return lottieCheck({root});
  const contract = root.querySelector(selector);
  assert(contract, `${key} is missing interaction contract ${selector}`);
  assert(contract.getAttribute('data-interaction-unsupported') !== 'lottie', `${key} used an unsupported Lottie placeholder`);
  const sourceActions = {
    'buttons/ActionBar': [['reply','reply'],['forward','forward'],['archive','archive'],['cancel','cancel'],['save','save']],
    'buttons/Button': [['primary','primary'],['secondary','secondary'],['outline','outline'],['ghost','ghost'],['subtle','subtle'],['danger','danger'],['link','link']],
    'buttons/With icons': [['new-file','new'],['share','share'],['sort','sort'],['delete','delete']],
  }[key];
  if (sourceActions) for (const [action, value] of sourceActions) { const control = root.querySelector(`[data-ely-action="${CSS.escape(action)}"]`); assert(control?.value === value, `${key} lost ${action}'s caller value`); control.click(); const event = emitted.find(item => item.action === action && item.value === value); assert(event?.id === root.id && event.component === key, `${key} emitted an incorrect ${action} payload`); }
  const filter = need('filter', root.querySelector('[data-interaction-filter]'));
  if (filter && !filter.disabled) { filter.value = 'zzzz-no-match'; filter.dispatchEvent(new Event('input', {bubbles: true})); const rows = [...root.querySelectorAll('.ely-interaction__items > li, .ely-interaction__items > .ely-interaction__menu-row')]; assert(rows.length > 0 && rows.every(row => row.hidden), 'filter did not hide nonmatching items'); filter.value = ''; filter.dispatchEvent(new Event('input', {bubbles: true})); }
  const toggle = need('toggle', root.querySelector('[data-interaction-toggle]'));
  if (toggle && !toggle.disabled) { const was = toggle.getAttribute('aria-pressed'); toggle.click(); assert(toggle.getAttribute('aria-pressed') !== was, 'toggle state did not change'); }
  const choice = need('choice', root.querySelector('[data-interaction-choice]'));
  if (choice && !choice.disabled) { choice.click(); assert(choice.getAttribute('aria-checked') === 'true', 'segmented choice did not select'); }
  const checkbox = root.querySelector('[data-interaction-checkbox]');
  if (checkbox && !checkbox.disabled) { const was = checkbox.getAttribute('aria-checked'); checkbox.click(); assert(checkbox.getAttribute('aria-checked') !== was, 'menu checkbox state did not change'); }
  const radio = root.querySelector('[data-interaction-menu-radio][aria-checked="false"]:not(:disabled)');
  if (radio) { radio.click(); const selected = [...root.querySelectorAll('[data-interaction-menu-radio][aria-checked="true"]')].filter(item => item.dataset.interactionMenuRadio === radio.dataset.interactionMenuRadio); assert(selected.length === 1 && selected[0] === radio, 'menu radio group did not select exclusively'); }
  const page = root.querySelector('[data-interaction-page][aria-current="page"]');
  if (page && !page.disabled) { page.click(); assert(page.getAttribute('aria-current') === 'page', 'pagination did not retain the selected page'); const event = changes.find(item => item.name === 'page' && item.value === page.value); assert(event?.selected === true, 'pagination change payload was not exact'); }
  const tab = need('tab', root.querySelector('[data-interaction-tab]'));
  if (tab && !tab.disabled) {
    const list = tab.closest('[role=tablist]');
    const forward = list?.getAttribute('aria-orientation') === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    tab.click();
    assert(tab.getAttribute('aria-selected') === 'true', 'tab did not select');
    tab.dispatchEvent(new KeyboardEvent('keydown', {key: forward, bubbles: true}));
    const enabledTabs = [...root.querySelectorAll('[data-interaction-tab]:not(:disabled)')];
    const disabledTab = root.querySelector('[data-interaction-tab]:disabled');
    if (disabledTab && enabledTabs.length > 1) {
      const lastEnabled = enabledTabs.at(-1);
      lastEnabled.click();
      lastEnabled.dispatchEvent(new KeyboardEvent('keydown', {key: forward, bubbles: true}));
      assert(disabledTab.getAttribute('aria-selected') !== 'true', 'keyboard navigation selected a disabled tab');
      assert(root.querySelector('[data-interaction-tab][aria-selected="true"]') === enabledTabs[0], 'keyboard navigation did not wrap to the first enabled tab');
    }
  }
  const editorPin = root.querySelector('[data-interaction-editor-pin]');
  if (editorPin && !editorPin.disabled) {
    const pinned = editorPin.getAttribute('aria-pressed');
    editorPin.click();
    assert(editorPin.getAttribute('aria-pressed') !== pinned, 'editor pin did not toggle');
    const event = emitted.find(item => item.action === editorPin.dataset.elyAction);
    assert(event?.id === root.id && event.component === root.dataset.elyComponent && event.value === editorPin.value, 'editor pin action payload was not exact');
  }
  const editorAdd = root.querySelector('[data-interaction-editor-add]');
  if (editorAdd && !editorAdd.disabled) { const before = root.querySelectorAll('[data-interaction-editor-tab]').length; editorAdd.click(); assert(root.querySelectorAll('[data-interaction-editor-tab]').length === before + 1, 'editor add did not create a file tab'); }
  const editorTab = root.querySelector('[data-interaction-editor-tab] [data-interaction-tab]');
  if (editorTab?.parentElement.nextElementSibling?.matches('[data-interaction-editor-tab]')) {
    const first = editorTab.parentElement;
    editorTab.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', altKey: true, bubbles: true}));
    assert(first.previousElementSibling?.matches('[data-interaction-editor-tab]'), 'editor keyboard reorder did not move the tab');
  }
  const menu = need('menu', root.querySelector('[data-interaction-menu]'));
  if (menu && !menu.disabled) { menu.click(); assert(menu.getAttribute('aria-expanded') === 'true', 'menu did not open'); const item = root.querySelector('[role=menu] button:not(:disabled)'); if (item) { item.focus(); item.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true})); assert(root.querySelector('[role=menu]').contains(document.activeElement), 'menu arrow navigation lost menu focus'); } menu.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); assert(menu.getAttribute('aria-expanded') === 'false', 'Escape did not dismiss the menu'); }
  const wizard = need('wizard', root.querySelector('[data-interaction-wizard]'));
  if (wizard) {
    const next = wizard.querySelector('[data-interaction-step-next]');
    const back = wizard.querySelector('[data-interaction-step-back]');
    const start = wizard.querySelector('[data-interaction-step][aria-current="step"]');
    assert(back?.disabled, 'wizard Back must be disabled on the first stage');
    next?.click();
    const current = wizard.querySelector('[data-interaction-step][aria-current="step"]');
    assert(current && current !== start && !back.disabled, 'wizard Next did not advance its stage');
    back.click();
    assert(wizard.querySelector('[data-interaction-step][aria-current="step"]') === start, 'wizard Back did not restore the prior stage');
  }
  const sidebar = need('sidebar', root.querySelector('[data-interaction-sidebar]'));
  if (sidebar) {
    const group = sidebar.querySelector('[data-interaction-nav-group-toggle]');
    const groupContent = group?.nextElementSibling;
    group?.click(); assert(groupContent?.hidden === true, 'sidebar group did not collapse');
    const fold = sidebar.querySelector('[data-interaction-nav-fold]');
    fold?.click(); assert(sidebar.classList.contains('is-folded'), 'sidebar did not fold into its icon rail');
    const item = sidebar.querySelector('[data-interaction-nav]');
    item?.click(); assert(item?.getAttribute('aria-current') === 'page', 'sidebar item did not select its pane');
  }
  const breadcrumb = root.querySelector('.ely-interaction__breadcrumb [data-interaction-menu]');
  if (breadcrumb && !breadcrumb.disabled) { breadcrumb.click(); assert(breadcrumb.getAttribute('aria-expanded') === 'true', 'breadcrumb sibling list did not open'); const sibling = root.querySelector('[data-interaction-breadcrumb-sibling]'); sibling?.click(); assert(breadcrumb.getAttribute('aria-expanded') === 'false', 'breadcrumb sibling list did not close'); }
  const navigationMenu = root.querySelector('.ely-interaction__navigation-menu [data-interaction-menu]');
  if (navigationMenu && !navigationMenu.disabled) { navigationMenu.click(); assert(navigationMenu.getAttribute('aria-expanded') === 'true', 'navigation menu did not open'); navigationMenu.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true})); assert(document.activeElement.matches('.ely-interaction__navigation-menu [data-interaction-menu]'), 'navigation menu ArrowRight did not retain menu focus'); const next = [...root.querySelectorAll('.ely-interaction__navigation-menu [data-interaction-menu]')].find(item => item !== navigationMenu); if (next) { next.dispatchEvent(new PointerEvent('pointerover', {bubbles: true})); assert(next.getAttribute('aria-expanded') === 'true', 'navigation menu hover did not switch the open panel'); } }
  const context = root.querySelector('[data-interaction-context]');
  const submenu = root.querySelector('.ely-interaction__menu-row > [data-interaction-menu]');
  if (submenu) {
    root.querySelector('[data-interaction-menu]').click();
    submenu.focus(); submenu.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
    const panel = root.querySelector(`#${CSS.escape(submenu.dataset.interactionMenu)}`);
    assert(!panel.hidden && panel.contains(document.activeElement), 'Right did not enter submenu');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}));
    assert(panel.hidden && document.activeElement === submenu, 'Left did not return to submenu trigger');
    submenu.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
  }
  if (root.querySelector('[data-interaction-search-menu]')) {
    filter.value = 'eng'; filter.dispatchEvent(new Event('input', {bubbles: true}));
    const match = root.querySelector('.ely-interaction__menu-row:not([hidden])');
    assert(match?.textContent.includes('Engineering') && match.querySelector('mark'), 'searchable menu did not rank and highlight a match');
    filter.value = ''; filter.dispatchEvent(new Event('input', {bubbles: true}));
    assert(root.querySelector('.ely-interaction__menu-row')?.textContent.includes('Inbox'), 'clearing search did not restore source order');
  }
  if (context) { context.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true})); assert(context.querySelector('[data-interaction-menu]')?.getAttribute('aria-expanded') === 'true', 'context menu did not open from a secondary-pointer event'); }
  const pie = root.querySelector('.ely-interaction__pie');
  if (pie) {
    const items = [...pie.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    items[0].focus(); items[0].dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
    assert(document.activeElement === items[1], 'radial arrows did not advance clockwise');
    pie.querySelector('[data-interaction-pie-close]').click();
    assert(pie.hidden, 'radial hub did not cancel');
  }
  const menubar = root.querySelector('.ely-interaction__menubar');
  if (menubar) {
    const triggers = [...menubar.querySelectorAll(':scope > .ely-interaction__menu > button')];
    triggers[0].click(); triggers[0].dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
    assert(triggers[0].getAttribute('aria-expanded') === 'false' && triggers[1].getAttribute('aria-expanded') === 'true', 'menu bar Right did not switch the open menu');
    triggers[1].dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
  }
  const lightbox = need('lightbox', root.querySelector('[data-interaction-lightbox-open]'));
  if (lightbox && !lightbox.disabled) {
    lightbox.click(); const dialog = root.querySelector('[data-interaction-lightbox]');
    assert(dialog?.open, 'lightbox thumbnail did not open its local view');
    assert(dialog.contains(document.activeElement), 'lightbox did not move focus into its local view');
    const before = dialog.querySelector('figcaption')?.textContent;
    dialog.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
    assert(dialog.querySelector('figcaption')?.textContent !== before, 'lightbox ArrowRight did not step to the next image');
    dialog.dispatchEvent(new KeyboardEvent('keydown', {key: '+', bubbles: true}));
    assert(dialog.querySelector('[data-interaction-lightbox-zoom]')?.textContent !== '100%', 'lightbox keyboard zoom did not update');
    dialog.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    await waitFor(() => !dialog.open);
    await waitFor(() => document.activeElement === lightbox);
    assert(document.activeElement === lightbox, 'lightbox close did not restore thumbnail focus');
  }
  const toastShow = root.querySelector('[data-interaction-toast-show]');
  if (toastShow && !toastShow.disabled) {
    toastShow.click();
    const toast = root.querySelector('[data-feedback-live]');
    assert(toast && !toast.hidden && toast.dataset.interactionToast === toastShow.dataset.interactionToastShow, 'toast launcher did not create the requested toast');
    toast.querySelector('[data-interaction-toast-dismiss]').click();
    assert(toast.inert || !toast.isConnected, 'toast dismissal did not start its exit');
    try { await waitFor(() => !toast.isConnected); } catch { assert(false, 'toast dismissal started but its 200 ms exit did not remove the instance'); }
    assert(!toast.isConnected, 'toast dismissal did not remove its instance');
    toastShow.click();
    const relaunched = root.querySelector('[data-feedback-live]');
    assert(relaunched && relaunched !== toast && !relaunched.hidden, 'dismissal destroyed the reusable toast recipe');
    relaunched.querySelector('[data-interaction-toast-dismiss]').click();
    assert(relaunched.inert || !relaunched.isConnected, 'toast repeat dismissal did not start its exit');
    try { await waitFor(() => !relaunched.isConnected); } catch { assert(false, 'toast repeat dismissal started but its 200 ms exit did not remove the instance'); }
    const undoRecipe = root.querySelector('[data-interaction-toast]:not([data-feedback-live]) [data-ely-action="undo"]')?.closest('[data-interaction-toast]');
    if (undoRecipe) {
      root.querySelector(`[data-interaction-toast-show="${CSS.escape(undoRecipe.dataset.interactionToast)}"]`).click();
      const undoToast = root.querySelector('[data-feedback-live]');
      undoToast.querySelector('[data-ely-action="undo"]').click();
      assert(undoToast.inert || !undoToast.isConnected, 'toast undo did not start its exit');
      try { await waitFor(() => !undoToast.isConnected); } catch { assert(false, 'toast undo started but its 200 ms exit did not remove the instance'); }
      assert(!undoToast.isConnected, 'toast undo did not remove its instance');
    }
  }
  const notificationRead = root.querySelector('[data-interaction-notification-read]');
  if (notificationRead && !notificationRead.hidden) {
    notificationRead.click();
    assert(!root.querySelector('[data-interaction-unread]') && notificationRead.hidden, 'mark-all-read did not clear unread state and its control');
    root.querySelector('[data-interaction-notification-clear]').click();
    assert(!root.querySelector('[data-interaction-notification]') && !root.querySelector('[data-feedback-notification-empty]').hidden, 'clear did not show the notification empty state');
    assert([...root.querySelectorAll('[data-feedback-group]')].every(group => group.hidden), 'clear left empty notification headings');
    const reset = root.querySelector('[data-interaction-notification-reset]');
    if (reset) { reset.click(); assert(root.querySelectorAll('[data-interaction-notification]').length === 5 && root.querySelectorAll('[data-interaction-unread]').length === 2, 'reset did not restore source notifications'); }
  }
  const alertDismiss = root.querySelector('[data-interaction-alert-dismiss]');
  if (alertDismiss) { const alert = alertDismiss.closest('[data-interaction-alert]'); alertDismiss.click(); assert(alert?.hidden, 'dismissible alert did not hide its own row'); const show = alert.parentElement.querySelector('[data-interaction-alert-show]'); if (show) { assert(!show.hidden, 'alert restore control stayed hidden'); show.click(); assert(!alert.hidden && show.hidden, 'alert restore did not restore only its row'); } }
  const bannerDismiss = root.querySelector('[data-interaction-banner-dismiss]');
  if (bannerDismiss) { const banner = bannerDismiss.closest('[data-interaction-banner]'); bannerDismiss.click(); await waitFor(() => banner?.hidden); assert(banner?.hidden, 'banner dismiss did not hide the banner'); const show = root.querySelector('[data-interaction-banner-show]'); show?.click(); assert(!banner.hidden, 'banner show control did not restore the banner'); }
  const statusNext = root.querySelector('[data-interaction-status-next]');
  if (statusNext) { const status = root.querySelector('[data-interaction-status-message]'); const before = status?.textContent; statusNext.click(); assert(status?.textContent !== before, 'status message did not advance'); }
  const savingRows = [...root.querySelectorAll('[data-feedback-status]')];
  for (const row of savingRows) {
    const next = row.querySelector('[data-interaction-saving-next]');
    if (!next) continue;
    const output = row.querySelector('[data-interaction-saving-state]');
    const values = [...row.querySelectorAll('[data-interaction-saving-values] i')];
    const siblings = savingRows.filter(other => other !== row).map(other => [other, other.querySelector('output').textContent]);
    for (let i = 1; i <= values.length; i++) {
      next.click(); const index = i % values.length;
      assert(output.textContent === values[index].textContent && output.dataset.state === values[index].dataset.state, 'status cycle did not select the exact caller state');
      assert(siblings.every(([other, text]) => other.querySelector('output').textContent === text), 'status cycle changed a sibling');
      const retry = row.querySelector('[data-interaction-saving-retry]');
      if (retry) assert(retry.hidden === !values[index].hasAttribute('data-retry'), 'retry visibility does not match the caller state');
    }
    const retry = row.querySelector('[data-interaction-saving-retry]');
    if (retry) { const failed = values.findIndex(value => value.hasAttribute('data-retry')); if (failed >= 0) { for (let i = 0; i < failed; i++) next.click(); retry.click(); assert(output.textContent === values[0].textContent && retry.hidden, 'saving retry did not return to the first state'); } }
  }
  const confirmation = root.querySelector('.ely-interaction__confirmation [data-ely-action]');
  if (confirmation) { confirmation.click(); assert(root.querySelector('[data-interaction-confirmation-status]')?.textContent === (confirmation.dataset.feedbackMessage || confirmation.textContent.trim()), 'confirmation did not publish its caller message'); }
  const boundaryToggle = root.querySelector('[data-feedback-boundary-toggle]');
  if (boundaryToggle) {
    boundaryToggle.click();
    const error = root.querySelector('[data-feedback-boundary-error]');
    assert(!error.hidden && error.textContent.includes(boundaryToggle.dataset.feedbackError), 'boundary did not show the supplied error');
    error.querySelector('[data-ely-action]').click();
    assert(error.hidden && !root.querySelector('[data-feedback-boundary-content]').hidden, 'boundary retry did not restore demo content');
  }
  const overlayReload = root.querySelector('[data-interaction-loading-overlay-toggle]');
  if (overlayReload && !overlayReload.disabled) { const overlay = overlayReload.closest('[data-interaction-loading-overlay]')?.querySelector('.ely-interaction__loading'); overlayReload.click(); assert(!overlay.hidden && overlayReload.disabled, 'loading overlay did not block the covered view'); const cancel=overlay.querySelector('[data-interaction-loading-overlay-cancel]'); if(cancel)cancel.click(); await waitFor(()=>overlay.hidden); assert(overlay.hidden && !overlayReload.disabled, 'loading overlay cancel did not restore controls'); }
  const lazy = root.querySelector('[data-interaction-lazy]');
  if (lazy) { const before = lazy.querySelectorAll('[data-interaction-lazy-loaded]').length; lazy.scrollTop = lazy.scrollHeight; lazy.dispatchEvent(new Event('scroll')); await waitFor(() => lazy.querySelectorAll('[data-interaction-lazy-loaded]').length > before); assert(lazy.querySelectorAll('[data-interaction-lazy-loaded]').length > before, 'lazy scroll did not reveal another row'); }
  const suspense = root.querySelector('[data-interaction-suspense]');
  if (suspense) { suspense.querySelector('[data-interaction-suspense-toggle]')?.click(); await waitFor(() => suspense.getAttribute('aria-busy') === 'false'); assert(!suspense.querySelector('[data-interaction-suspense-content]').hidden, 'suspense reload did not reveal resolved content'); suspense.querySelector('[data-interaction-suspense-fail]')?.click(); await waitFor(() => !suspense.querySelector('[data-interaction-suspense-error]').hidden); assert(!suspense.querySelector('[data-interaction-suspense-error]').hidden, 'suspense failure did not reveal retry state'); suspense.querySelector('[data-interaction-suspense-error] button').click(); await waitFor(()=>suspense.getAttribute('aria-busy')==='false'); assert(suspense.querySelector('[data-interaction-suspense-error]').hidden&&!suspense.querySelector('[data-interaction-suspense-content]').hidden,'Try again did not recover the report'); }
  const progressStep=root.querySelector('[data-loading-progress-step]');
  if(progressStep){progressStep.click();assert([...root.querySelectorAll('[data-progress-linked]')].every(node=>node.dataset.progressValue==='72'),'source Step did not update linked bar and ring');}
  const clockRestart=root.querySelector('[data-loading-clock] [data-interaction-countdown-reset]');
  if(clockRestart){clockRestart.click();assert(clockRestart.closest('[data-loading-clock]').querySelector('output').textContent==='00:10','countdown restart did not restore ten seconds');}
  const refresh = root.querySelector('[data-interaction-refresh]');
  if (refresh && !refresh.disabled) { refresh.click(); assert(root.querySelector('[data-interaction-refresh-live]')?.textContent === 'Refreshing', 'refresh did not enter its working state'); }
  const uploadTick = root.querySelector('[data-interaction-upload-tick]');
  if (uploadTick) { const progress = root.querySelector('[data-interaction-upload-state="uploading"] progress'); const before = Number(progress?.value); uploadTick.click(); assert(Number(progress?.value) > before, 'upload tick did not advance uploading files'); const failed = root.querySelector('[data-interaction-upload-state="failed"] [data-interaction-upload-retry]'); const failedRow = failed?.closest('[data-interaction-upload]'); assert(failedRow, 'upload fixture has no failed row'); failed.click(); assert(failedRow.dataset.interactionUploadState === 'uploading', 'upload retry did not return a failed file to upload'); }
  const transition = root.querySelector('[data-interaction-transition-toggle]');
  if (transition && !transition.disabled) { const article = transition.closest('[data-interaction-transition]')?.querySelector('article'); transition.click(); await waitFor(()=>article?.hidden); assert(article?.hidden && transition.textContent === 'Show', 'transition toggle did not hide content'); transition.click(); assert(!article.hidden && transition.textContent === 'Hide', 'transition toggle did not replay content'); }
  const presence = root.querySelector('[data-interaction-presence]');
  if (presence) { const toggle = presence.querySelector('[data-interaction-presence-toggle]'); const before = presence.querySelectorAll('[data-interaction-presence-list] > *').length; toggle?.click(); await waitFor(() => presence.querySelectorAll('[data-interaction-presence-list] > *').length === before + 1); assert(presence.querySelectorAll('[data-interaction-presence-list] > *').length === before + 1, 'AnimatePresence did not add a local row'); const added = presence.querySelector('[data-interaction-presence-list]').lastElementChild; assert(added.querySelector('[data-motion-remove]').getBoundingClientRect().height===24,'presence remove button exceeded 24px'); added.querySelector('[data-motion-remove]').click(); await waitFor(() => !added.isConnected); assert(!added.isConnected && presence.querySelectorAll('[data-interaction-presence-list] > *').length === before, 'presence exit did not remove only the requested row'); }
  const motionControl = need('motionControl', root.querySelector('[data-interaction-stagger-replay], [data-interaction-flip-toggle]'));
  if (motionControl && !motionControl.disabled) {
    const list = motionControl.closest('[data-interaction-flip]')?.querySelector('ol');
    const expected = list ? [...list.children].map(row => row.dataset.motionKey) : null;
    if (expected && expected.length > 1) { expected.push(...expected.splice(0, Math.min(2, expected.length))); if (expected.length > 3) [expected[0],expected[3]] = [expected[3],expected[0]]; }
    motionControl.click(); await waitFor(() => changes.length > 0);
    assert(changes.length > 0, 'motion control did not publish a local state change');
    if (list) assert(JSON.stringify([...list.children].map(row => row.dataset.motionKey)) === JSON.stringify(expected), 'FLIP did not apply the source permutation to stable keys');
  }
  const lanes = [...root.querySelectorAll('[data-direct-lane]')];
  if (lanes.length > 1) {
    const chip = lanes[0].querySelector('[data-interaction-draggable]'), transfer = new DataTransfer();
    chip.dispatchEvent(new DragEvent('dragstart', {bubbles:true,cancelable:true,dataTransfer:transfer}));
    lanes[0].dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:transfer}));
    assert(chip.parentElement === lanes[0], 'drag accepted its original lane');
    lanes[1].dispatchEvent(new DragEvent('dragover', {bubbles:true,cancelable:true,dataTransfer:transfer}));
    lanes[1].dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:transfer}));
    assert(chip.parentElement === lanes[1] && emitted.some(event => event.action === 'drop' && event.value === chip.dataset.interactionValue && event.to === lanes[1].dataset.directLane), 'drop did not move the caller item with its lane payload');
  }
  const virtual = root.querySelector('[data-direct-count]');
  if (virtual && Number(virtual.dataset.directCount)) {
    virtual.scrollTop = 28000; virtual.dispatchEvent(new Event('scroll'));
    const rows = [...virtual.querySelector('[data-direct-virtual-rows]').children];
    assert(rows.length < 20 && Number(rows[0].dataset.index) >= 998, 'virtual scroll did not replace the bounded visible row window');
  }
  const sync = root.querySelector('[data-direct-sync]');
  if (sync) { const [left,right] = sync.children; left.scrollTop = 112; left.dispatchEvent(new Event('scroll')); assert(right.scrollTop === 112, 'scroll sync did not follow the first pane'); right.scrollTop = 224; right.dispatchEvent(new Event('scroll')); assert(left.scrollTop === 224, 'scroll sync did not follow the second pane'); }
  const rotation = root.querySelector('[data-direct-rotate]');
  if (rotation) { const before = Number(rotation.dataset.directRotate); rotation.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})); assert(Number(rotation.dataset.directRotate) === (Math.round(before / 15) * 15 + 15) % 360, 'rotation did not advance by one source notch'); }
  const area = root.querySelector('[data-direct-selection]');
  if (area) { area.dispatchEvent(new KeyboardEvent('keydown',{key:'a',metaKey:true,bubbles:true,cancelable:true})); assert(area.querySelectorAll('[aria-selected="true"]').length === 12, 'selection area did not select all source tiles'); area.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})); assert(!area.querySelector('[aria-selected="true"]'), 'Escape did not clear tile selection'); }
  const fruits = root.querySelector('[data-direct-typeahead]');
  if (fruits) { const first = fruits.querySelector('button'); first.focus(); first.dispatchEvent(new KeyboardEvent('keydown',{key:'b',bubbles:true,cancelable:true})); assert(document.activeElement?.value === 'banana', 'typeahead did not select the matching fruit'); }
  const dialogAction = need('dialogAction', root.querySelector('.ely-interaction__dialog [data-ely-action], .ely-interaction__dialog form[data-ely-submit]'));
  if (dialogAction) assert(root.querySelector('.ely-interaction__dialog [data-interaction-close]'), 'dialog is missing an explicit close control');
  const dialog = need('dialog', root.querySelector('[data-interaction-dialog]'));
  if (dialog && !dialog.disabled) { dialog.click(); const target = root.querySelector(`#${CSS.escape(dialog.dataset.interactionDialog)}`); assert(target?.open || target?.hidden === false, 'dialog did not open'); if (target?.matches('.ely-interaction__dialog')) { assert(target.contains(document.activeElement), 'dialog did not move focus to a local control'); const focusables = [...target.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter(node => !node.hidden && node.getClientRects().length > 0); if (focusables.length > 1) { const first = focusables[0], last = focusables.at(-1); last.focus(); last.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true})); await waitFor(() => document.activeElement === first); first.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', shiftKey: true, bubbles: true, cancelable: true})); await waitFor(() => document.activeElement === last); } } if (target?.matches('[data-interaction-palette]')) {
      const input = target.querySelector('[data-interaction-filter]');
      const options = [...target.querySelectorAll('[data-interaction-palette-option]')];
      input.value = options[0]?.textContent.trim().slice(0, 4) || ''; input.dispatchEvent(new Event('input', {bubbles: true}));
      assert(options.some(option => !option.closest('li').hidden), 'palette filtering hid every matching result');
      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}));
      assert(target.contains(document.activeElement), 'palette ArrowDown did not retain result focus');
      const option = document.activeElement.closest('[data-interaction-palette-option]');
      assert(option && !option.closest('li').hidden, 'palette keyboard selected a filtered-out result');
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
      await waitFor(() => !target.open);
      const event = emitted.find(item => item.action === option?.dataset.elyAction && item.value === option?.value);
      assert(event?.id === root.id && event.component === root.dataset.elyComponent, 'palette action payload was not exact');
    } else if (target?.matches('[data-interaction-lightbox]')) { target.dispatchEvent(new MouseEvent('click', {bubbles: true})); assert(!target.open, 'lightbox backdrop did not dismiss the dialog'); } else { target?.querySelector('[data-interaction-close]')?.click(); await waitFor(() => document.activeElement === dialog); assert(document.activeElement === dialog, 'dialog close did not restore trigger focus'); } }
  const alertTrigger = [...root.querySelectorAll('[data-interaction-dialog]')].find(trigger => root.querySelector(`#${CSS.escape(trigger.dataset.interactionDialog)}`)?.getAttribute('role') === 'alertdialog');
  if (alertTrigger && !alertTrigger.disabled) {
    alertTrigger.click();
    const alert = root.querySelector(`#${CSS.escape(alertTrigger.dataset.interactionDialog)}`);
    assert(alert?.open && alert.dataset.interactionDismissible === 'false', 'alert dialog must remain open until acknowledged');
    assert(!alert.querySelector('[data-interaction-close]'), 'non-dismissible alert dialog exposed a close control');
    alert.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    assert(alert.open, 'Escape dismissed an acknowledgment-required alert dialog');
    const acknowledge = alert.querySelector('[data-interaction-dialog-action]');
    root.dispatchEvent(new CustomEvent('ely:result', {bubbles: true, detail: {id: root.id, component: root.dataset.elyComponent, action: acknowledge?.dataset.elyAction}}));
    await waitFor(() => !alert.open);
    await waitFor(() => document.activeElement === alertTrigger);
  }
  const resize = need('resize', root.querySelector('[data-interaction-resize]'));
  const popover = root.querySelector('[data-interaction-popover]');
  if (popover) {
    const trigger = root.querySelector('[data-interaction-menu]');
    trigger.click(); assert(!popover.hidden && popover.contains(document.activeElement), 'popover did not take focus');
    const controls = [...popover.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
    if (controls.length) {
      controls.at(-1).focus(); controls.at(-1).dispatchEvent(new KeyboardEvent('keydown', {key:'Tab', bubbles:true, cancelable:true}));
      assert(document.activeElement === controls[0], 'popover Tab escaped its focus scope');
    }
    const toggle = popover.querySelector('[role="switch"]');
    if (toggle) { toggle.click(); assert(!popover.hidden, 'changing a popover switch closed its panel'); }
    const bounds = popover.getBoundingClientRect();
    assert(bounds.left >= 0 && bounds.right <= innerWidth + 1 && bounds.top >= 0 && bounds.bottom <= innerHeight + 1, 'popover is outside viewport bounds');
    popover.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}));
    assert(popover.hidden && document.activeElement === trigger, 'popover Escape did not close and restore focus');
  }
  const hover = root.querySelector('[data-interaction-hover]');
  if (hover) {
    const panel = hover.querySelector('[data-interaction-hover-panel]');
    const previous = document.activeElement;
    hover.dispatchEvent(new PointerEvent('pointerenter'));
    assert(panel.hidden, 'hover content opened before its delay');
    await waitFor(() => !panel.hidden);
    assert(document.activeElement === previous, 'hover content took focus');
    hover.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}));
    assert(panel.hidden, 'Escape did not dismiss hover content');
    hover.dispatchEvent(new PointerEvent('pointerleave'));
  }
  const tourOpen = root.querySelector('[data-interaction-tour-open]');
  if (tourOpen) {
    tourOpen.click(); const tour = root.querySelector('[data-interaction-tour]');
    assert(tour.open && tour.dataset.interactionTourIndex === '0', 'tour did not open at its first stop');
    tour.querySelector('[data-interaction-tour-next]').click();
    assert(tour.dataset.interactionTourIndex === '1', 'tour Next did not advance');
    tour.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowLeft', bubbles:true}));
    assert(tour.dataset.interactionTourIndex === '0', 'tour Left did not return');
    tour.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}));
    await waitFor(() => !tour.open && document.activeElement === tourOpen);
    const coach = root.querySelector('[data-interaction-tour-coach]');
    coach.click(); assert(tour.dataset.interactionTourCoach === 'true' && tour.dataset.interactionTourIndex === '1', 'coachmark did not target Invite');
    tour.querySelector('[data-interaction-tour-next]').click(); assert(!tour.open, 'coachmark Done did not close');
  }
  const selection = root.querySelector('[data-interaction-selection-field]');
  if (selection) {
    selection.focus(); selection.setSelectionRange(0, 6); selection.dispatchEvent(new Event('select'));
    const toolbar = root.querySelector('[role="toolbar"]');
    assert(!toolbar.hidden, 'selection did not reveal floating tools');
    const tool = toolbar.querySelector('button');
    tool.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, cancelable:true})); tool.click();
    assert(document.activeElement === selection && selection.selectionStart === 0 && selection.selectionEnd === 6, 'floating tool lost field focus or selection');
    selection.setSelectionRange(0, 0); selection.dispatchEvent(new Event('select'));
    assert(toolbar.hidden, 'collapsed selection did not hide tools');
  }
  const peek = root.querySelector('[data-interaction-peek]');
  if (peek) {
    peek.click(); const panel = root.querySelector('.ely-interaction__callout');
    assert(!panel.hidden && peek.getAttribute('aria-expanded') === 'true', 'Peek did not expand in the document');
    panel.querySelector('[data-interaction-peek-close]').click();
    assert(panel.hidden && document.activeElement === peek, 'Peek close did not restore its trigger');
    peek.click(); assert(!panel.hidden, 'Peek could not reopen'); peek.click();
  }
  if (resize && !resize.disabled) {
    const panel = resize.closest('[data-interaction-resizable]'), width = Number(panel.dataset.width);
    resize.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true,cancelable:true}));
    assert(Number(panel.dataset.width) === Math.min(width + 8, Number(panel.dataset.maxWidth)), 'resize did not apply the source keyboard step');
    for (let i = 0; i < 50; i++) resize.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true,cancelable:true}));
    assert(Number(panel.dataset.width) === Number(panel.dataset.maxWidth), 'resize exceeded caller maximum');
  }
  const undo = need('undo', root.querySelector('[data-interaction-undo]'));
  if (undo) {
    const output = root.querySelector('[data-interaction-undo-count]'), initial = Number(output.textContent), add = root.querySelector('[data-interaction-increment]'), redo = root.querySelector('[data-interaction-redo]');
    assert(undo.disabled && redo.disabled, 'empty history must disable undo and redo');
    add.click(); assert(Number(output.textContent) === initial + 1 && !undo.disabled, 'record did not store the previous count');
    undo.click(); assert(Number(output.textContent) === initial && !redo.disabled, 'undo did not restore the snapshot');
    redo.click(); assert(Number(output.textContent) === initial + 1, 'redo did not restore the changed count');
    undo.click(); root.querySelector('[data-interaction-decrement]').click(); assert(redo.disabled, 'a new history branch kept obsolete redo state');
  }
  const hotkeys = need('hotkeys', root.querySelector('[data-interaction-hotkeys]'));
  if (hotkeys && hotkeys.getAttribute('aria-disabled') !== 'true') {
    if (hotkeys.querySelector('[data-direct-binding]')) {
      const before = emitted.length;
      hotkeys.dispatchEvent(new KeyboardEvent('keydown', {key:'k',metaKey:true,bubbles:true,cancelable:true}));
      assert(emitted.length === before && hotkeys.querySelector('[data-direct-pending]').textContent.includes('waiting for the second'), 'chord prefix fired an action early');
      hotkeys.dispatchEvent(new KeyboardEvent('keydown', {key:'s',metaKey:true,bubbles:true,cancelable:true}));
      assert(emitted.at(-1)?.action === 'save-all' && hotkeys.querySelector('[data-direct-pending]').textContent === 'No chord waiting.', 'completed chord did not dispatch its action');
      hotkeys.dispatchEvent(new KeyboardEvent('keydown', {key:'H',metaKey:true,shiftKey:true,bubbles:true,cancelable:true}));
      assert(emitted.at(-1)?.action === 'shout', 'shortcut did not dispatch its bound action');
    } else { hotkeys.dispatchEvent(new KeyboardEvent('keydown', {key:'k',ctrlKey:true,bubbles:true})); assert(emitted.at(-1)?.action === hotkeys.dataset.interactionAction, 'legacy hotkey action was lost'); }
  }
  const ripple = need('ripple', root.querySelector('[data-interaction-ripple]'));
  if (ripple && !ripple.disabled) { ripple.click(); assert(ripple.querySelector('.ely-interaction__ripple-wave'), 'ripple did not create a clipped wave'); }
  const confirmTwice = root.querySelector('[data-interaction-confirm-mode="twice"]');
  if (confirmTwice && !confirmTwice.disabled) { const label = confirmTwice.textContent; confirmTwice.click(); assert(confirmTwice.dataset.interactionConfirmArmed === 'true', 'twice confirmation did not arm'); confirmTwice.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); assert(confirmTwice.dataset.interactionConfirmArmed !== 'true' && confirmTwice.textContent === label, 'Escape did not cancel a twice confirmation'); confirmTwice.click(); confirmTwice.click(); const event = emitted.find(item => item.action === confirmTwice.dataset.interactionHold && item.value === confirmTwice.value); assert(event?.id === root.id && event.component === key, 'twice confirmation payload was not exact'); }
  const copy = root.querySelector('[data-interaction-copy]');
  if (copy && !copy.disabled) { copy.click(); await waitFor(() => root.querySelector('[data-interaction-copy-status]')?.textContent === 'Copied'); const event = emitted.find(item => item.action === copy.dataset.elyAction && item.value === copy.value); assert(event?.id === root.id && event.component === key, 'copy payload was not exact'); }
  const bulkAdd = root.querySelector('[data-interaction-bulk-add]');
  if (bulkAdd && !bulkAdd.disabled) { const host = bulkAdd.closest('[data-interaction-bulk]'); bulkAdd.click(); assert(host?.querySelector('[data-interaction-bulk-count]')?.textContent === '1' && !host.querySelector('.ely-interaction__bar.is-bulk').hidden, 'bulk selection did not reveal its action bar'); host.querySelector('[data-interaction-bulk-clear]')?.click(); assert(host.querySelector('[data-interaction-bulk-count]')?.textContent === '0' && host.querySelector('.ely-interaction__bar.is-bulk').hidden, 'bulk clear did not hide its action bar'); }
  const pending = root.querySelector('[data-interaction-loading], [data-interaction-more]');
  if (pending && !pending.disabled) {
    const action = pending.dataset.interactionPendingAction;
    const count = root.querySelector('[data-interaction-more-count]');
    const more = root.querySelector("[data-loading-more]"), before = more ? Number(more.dataset.shown) : Number(count?.textContent);
    pending.click();
    assert(pending.getAttribute('aria-busy') === 'true' && pending.disabled, 'pending control accepted another press while busy');
    if (action) {
      root.dispatchEvent(new CustomEvent('ely:result', {bubbles: true, detail: {id: root.id, component: root.dataset.elyComponent, action}}));
      assert(pending.getAttribute('aria-busy') === 'false' && !pending.disabled, 'host result did not settle the pending control');
      if (count) assert(more ? Number(more.dataset.shown) === Math.min(more.querySelectorAll('[data-loading-more-row]').length, before + Number(more.dataset.pageSize)) : Number(count.textContent) === before + 1, 'LoadMore did not advance by its page size after host result');
      const settledCount=count?.textContent;
      pending.click();
      expectError('expected');
      root.dispatchEvent(new CustomEvent('ely:error', {bubbles: true, detail: {id: root.id, action, error: new Error('expected')}}));
      assert(pending.getAttribute('aria-busy') === 'false' && !pending.disabled, 'host error did not release the pending control');
      if (count) assert(count.textContent === settledCount, 'LoadMore advanced after host error');
    }
  }
  const reorder = need('reorder', root.querySelector('[data-interaction-reorder] [data-interaction-draggable]'));
  if (reorder) {
    const list=reorder.parentElement, rows=[...list.children], dataTransfer=new DataTransfer(), box=reorder.getBoundingClientRect(), bounds=list.getBoundingClientRect();
    reorder.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer,clientY:box.top+box.height/2}));
    list.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer,clientY:bounds.bottom-1}));
    assert(rows.slice(1).some(row=>row.style.transform && row.style.transform!=='translateY(0px)'), 'Reorder hover did not displace neighbors');
    assert([...list.children].every((row,i)=>row===rows[i]), 'Reorder hover committed caller order before drop');
    reorder.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer}));
    assert(rows.every(row=>!row.style.transform), 'Reorder cancellation retained hover transforms');
    reorder.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true})); const event = emitted.at(-1); assert(event?.action === 'reorder' && event.value === reorder.dataset.interactionValue && event.direction === 'down', 'keyboard reorder payload was not exact');
  }
  const toolbar = root.querySelector('[role="toolbar"] button:not(:disabled)');
  if (toolbar) {
    if (selection) { selection.focus(); selection.setSelectionRange(0, 6); selection.dispatchEvent(new Event('select')); }
    const bar = toolbar.closest('[role="toolbar"]');
    const buttons = [...bar.querySelectorAll('button:not(:disabled)')];
    assert(!bar.hidden, 'toolbar keyboard check requires a visible toolbar');
    toolbar.focus();
    assert(!bar.hidden && document.activeElement === toolbar, 'keyboard entry hid the toolbar');
    toolbar.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true, cancelable: true}));
    assert(document.activeElement === buttons[1 % buttons.length], 'toolbar ArrowRight did not focus the next enabled button');
    assert(!bar.hidden, 'toolbar disappeared during roving focus');
    buttons.at(-1).focus(); buttons.at(-1).dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true, cancelable:true}));
    assert(document.activeElement === (bar.hasAttribute('data-direct-toolbar') ? buttons.at(-1) : buttons[0]), 'toolbar endpoint did not follow its source focus contract');
    if (selection) {
      selection.focus(); selection.setSelectionRange(0, 0); selection.dispatchEvent(new Event('select'));
      assert(bar.hidden, 'collapsed selection did not hide tools after keyboard use');
    }
  }
  const action = root.querySelector('[data-ely-action]:not([data-interaction-editor-pin]):not([data-interaction-palette-option]):not(:disabled)');
  if (action) { action.click(); const event = emitted.find(item => item.action === action.dataset.elyAction); assert(event?.id === root.id && event.component === root.dataset.elyComponent && event.value === (action.value || action.dataset.value || ''), 'button action payload was not exact'); }
  const form = need('form', root.querySelector('form[data-ely-submit]'));
  if (root.dataset.elyDisabled !== 'true' && form?.checkValidity()) { form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})); const event = emitted.find(item => item.action === form.dataset.elySubmit); assert(event?.id === root.id && event.component === root.dataset.elyComponent && Array.isArray(event.values), 'form action payload was not exact'); }
  const hold = need('hold', root.querySelector('[data-interaction-hold], [data-interaction-longpress]'));
  if (hold && !hold.disabled) { hold.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})); await new Promise(resolve => setTimeout(resolve, 720)); hold.dispatchEvent(new PointerEvent('pointerup', {bubbles: true})); const event = emitted.at(-1); const expected = hold.dataset.interactionLongpress || hold.dataset.interactionHold; assert(event?.action === expected && event.value === hold.value, 'hold action payload was not exact'); }
  const disabled = root.querySelector('button:disabled');
  if (disabled) { const before = emitted.length; disabled.click(); assert(emitted.length === before, 'disabled button emitted an action'); }
};

// This exact alias has radio defaults even though it shares the checkbox renderer.
// Keep mandatory radio roles and interaction assertions separate from CheckboxMenuItem.
const radioMenuItemCheck = async ({root,twin}) => {
  assert(root.dataset.elyComponent === 'menus/RadioMenuItem', 'RadioMenuItem check requires the exact alias');
  assert(root.dataset.elyReady === 'true', 'RadioMenuItem root did not mount');
  const trigger = root.querySelector('[data-interaction-menu]');
  const panel = trigger && root.querySelector(`#${CSS.escape(trigger.dataset.interactionMenu)}`);
  assert(trigger && panel?.getAttribute('role') === 'menu', 'RadioMenuItem is missing its controlled menu');
  const rows = [...panel.querySelectorAll('[data-interaction-menu-action]')].filter(row => row.closest('[role="menu"]') === panel);
  assert(rows.length === 6 && rows.every(row => row.getAttribute('role') === 'menuitemradio' && row.hasAttribute('data-interaction-menu-radio') && !row.hasAttribute('data-interaction-checkbox')), 'RadioMenuItem fixture leaves must expose radio semantics');
  const groups = new Map();
  for (const row of rows) { const name = row.dataset.interactionMenuRadio; if (!groups.has(name)) groups.set(name, []); groups.get(name).push(row); }
  assert(groups.size === 2 && groups.get('default')?.length === 3 && groups.get('density')?.length === 3, 'RadioMenuItem must preserve default and explicit density groups');
  const state = nodes => nodes.map(row => [row.value, row.getAttribute('aria-checked')]);
  const twinBefore = twin && JSON.stringify(state([...twin.querySelectorAll('[aria-checked]')]));
  const changes = [], actions = [], order = [];
  const capture = (events, kind) => event => { if (event.target === root) { order.push(kind); events.push({...event.detail, panelClosed:panel.hidden}); } };
  const onChange = capture(changes, 'change'), onAction = capture(actions, 'action');
  root.addEventListener('ely:change', onChange); root.addEventListener('ely:action', onAction);
  try {
    for (const [group, items] of groups) {
      const target = items.find(row => row.getAttribute('aria-checked') === 'false' && !row.disabled);
      assert(target, `RadioMenuItem ${group} needs an enabled unselected caller option`);
      const peers = rows.filter(row => row.dataset.interactionMenuRadio !== group), peersBefore = JSON.stringify(state(peers));
      for (const repeat of [false, true]) {
        changes.length = 0; actions.length = 0; order.length = 0;
        trigger.click();
        assert(!panel.hidden && trigger.getAttribute('aria-expanded') === 'true', 'RadioMenuItem trigger did not open its menu');
        target.click();
        assert(items.every(row => row.getAttribute('aria-checked') === String(row === target)), repeat ? 'RadioMenuItem reselection must stay selected' : 'RadioMenuItem selection must be exclusive within its group');
        assert(JSON.stringify(state(peers)) === peersBefore, 'RadioMenuItem selection must preserve the other group');
        assert(panel.hidden && trigger.getAttribute('aria-expanded') === 'false' && document.activeElement === trigger, 'RadioMenuItem selection must dismiss and restore trigger focus');
        assert(order.join(',') === 'change,action' && changes.length === 1 && actions.length === 1, 'RadioMenuItem must emit exactly one settled change then action');
        assert(changes[0].name === group && changes[0].value === target.value && changes[0].checked === true && changes[0].panelClosed, 'RadioMenuItem change must report its committed caller value after dismissal');
        assert(actions[0].id === root.id && actions[0].component === 'menus/RadioMenuItem' && actions[0].action === target.dataset.elyAction && actions[0].value === target.value && actions[0].panelClosed, 'RadioMenuItem action must retain exact alias identity and caller payload after dismissal');
      }
    }
    if (twin) assert(JSON.stringify(state([...twin.querySelectorAll('[aria-checked]')])) === twinBefore, 'RadioMenuItem selection must not alter its independent twin');
  } finally {
    root.removeEventListener('ely:change', onChange); root.removeEventListener('ely:action', onAction);
  }
};

const lottieCheck = async ({root}) => {
  const host = root.querySelector('[data-interaction-lottie]');
  const play = root.querySelector('[data-interaction-lottie-play]');
  const pause = root.querySelector('[data-interaction-lottie-pause]');
  const seek = root.querySelector('[data-interaction-lottie-seek]');
  const progress = root.querySelector('[data-interaction-lottie-progress]');
  const status = root.querySelector('[data-interaction-lottie-status]');
  assert(host && play && pause && seek && progress && status, 'Lottie Player is missing playback controls');
  for (let attempt = 0; attempt < 10 && !host.querySelector('svg'); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  assert(host.querySelector('svg'), 'Lottie Player did not render SVG frames');
  seek.value = '50'; seek.dispatchEvent(new Event('input', {bubbles: true}));
  assert(progress.textContent === '50%', 'Lottie seek did not update frame progress');
  pause.click(); assert(status.textContent === 'Animation paused', 'Lottie pause did not change playback state');
  play.click(); assert(status.textContent === 'Animation playing', 'Lottie play did not change playback state');
};

const checks = Object.fromEntries(Object.entries(stories).flatMap(([chapter, names]) => names.map(name => [`${chapter}/${name}`, context => check(context, contracts[chapter][name])])));
checks['menus/RadioMenuItem'] = radioMenuItemCheck;
checks['motion/Lottie Player'] = lottieCheck;
registerChecks('interaction', checks);
