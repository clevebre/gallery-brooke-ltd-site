import { filterWorks, relatedWorks, nextWorkId, checkoutFor } from './catalogue.mjs';
import { parseRoute, resolveRoute, routeHash, toggleSelection, resultMessage, titleNote, checkoutNotice } from './view-state.mjs';

const byId = id => document.getElementById(id);
const workDialog = byId('work-dialog');
const collectionDialog = byId('collection-dialog');
let catalogue;
let selectedQualities = [];
let visibleWorks = [];
let currentWorkId = null;
let currentCollectionId = null;
let returnFocus = null;
let lastSection = '#explore';

function text(id, value) { byId(id).textContent = value; }
function make(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
function label(items, id) { return items.find(item => item.id === id)?.label ?? id; }
function imageFor(work, thumbnail = false) {
  const image = make('img');
  image.src = thumbnail ? work.image.thumbnail : work.image.src;
  image.alt = work.alt;
  image.width = work.image.width;
  image.height = work.image.height;
  if (thumbnail) image.loading = 'lazy';
  image.decoding = 'async';
  return image;
}

function applyFilters() {
  visibleWorks = filterWorks(catalogue.works, {
    kind: byId('kind-filter').value,
    query: byId('work-search').value,
    qualities: selectedQualities,
  });
  const shown = new Set(visibleWorks.map(work => work.id));
  for (const card of byId('work-grid').children) {
    const id = card.dataset.workId ?? card.querySelector('[data-work-id]')?.dataset.workId;
    card.hidden = !shown.has(id);
  }
  text('result-count', resultMessage(visibleWorks.length, catalogue.works.length));
  byId('empty-state').hidden = visibleWorks.length !== 0;
  for (const button of byId('quality-filters').querySelectorAll('[data-quality]')) {
    button.setAttribute('aria-pressed', String(selectedQualities.includes(button.dataset.quality)));
  }
}

function resetFilters() {
  byId('work-search').value = '';
  byId('kind-filter').value = 'all';
  selectedQualities = [];
  applyFilters();
}

function navigate(route, trigger) {
  const present = parseRoute(location.hash);
  const alreadyModal = present.type === 'work' || present.type === 'collection';
  if (!alreadyModal) returnFocus = trigger ?? document.activeElement;
  const state = { ...history.state, galleryModal: true, galleryReturn: alreadyModal ? history.state?.galleryReturn ?? lastSection : location.hash || lastSection };
  const hash = routeHash(route);
  if (alreadyModal) history.replaceState(state, '', hash);
  else history.pushState(state, '', hash);
  syncRoute();
}

function restoreFocus() {
  const target = returnFocus?.isConnected && !returnFocus.closest('[hidden]') ? returnFocus : byId('work-search');
  target?.focus({ preventScroll: true });
  returnFocus = null;
}

function closeDialogs(shouldRestore = false) {
  const wasOpen = workDialog.open || collectionDialog.open;
  if (workDialog.open) workDialog.close();
  if (collectionDialog.open) collectionDialog.close();
  currentWorkId = null;
  currentCollectionId = null;
  if (wasOpen && shouldRestore) restoreFocus();
}

function requestClose() {
  if (history.state?.galleryModal) {
    history.back();
  } else {
    history.replaceState(null, '', lastSection);
    syncRoute();
  }
}

function renderWork(work) {
  if (collectionDialog.open) collectionDialog.close();
  const changed = currentWorkId !== work.id;
  currentCollectionId = null;
  currentWorkId = work.id;
  const navigationWorks = visibleWorks.some(item => item.id === work.id) ? visibleWorks : catalogue.works;
  text('work-position', `${String(navigationWorks.findIndex(item => item.id === work.id) + 1).padStart(2, '0')} / ${String(navigationWorks.length).padStart(2, '0')}`);
  const image = byId('work-image');
  image.src = work.image.src;
  image.alt = work.alt;
  image.width = work.image.width;
  image.height = work.image.height;
  image.decoding = 'async';
  text('work-kind', label(catalogue.kinds, work.kind));
  text('work-title', work.title);
  text('work-title-note', titleNote(work.titleStatus, catalogue.site.mode));
  text('work-description', work.description);
  byId('work-qualities').replaceChildren(...work.qualities.map(quality => make('span', '', label(catalogue.qualities, quality))));
  const facts = [['Source', work.sourceLabel], ['Image', `${work.image.width} × ${work.image.height} web preview`]];
  if (work.creationMethod) facts.push(['Making method', work.creationMethod]);
  if (work.year) facts.push(['Year', String(work.year)]);
  byId('work-facts').replaceChildren(...facts.flatMap(([term, value]) => [make('dt', '', term), make('dd', '', value)]));
  const collection = catalogue.collections.find(item => item.id === work.collectionId);
  byId('work-collection').hidden = !collection;
  if (collection) byId('work-collection').dataset.collectionId = collection.id;
  const related = relatedWorks(catalogue.works, work.id, 3).map(item => {
    const button = make('button');
    button.type = 'button';
    button.dataset.openWork = item.id;
    button.setAttribute('aria-label', `View ${item.title}`);
    button.append(imageFor(item, true), make('span', '', item.title));
    return button;
  });
  byId('related-works').replaceChildren(...related);
  byId('previous-work').disabled = navigationWorks.length < 2;
  byId('next-work').disabled = navigationWorks.length < 2;
  if (!workDialog.open) workDialog.showModal();
  if (changed) workDialog.scrollTop = 0;
}

function renderCollection(collection) {
  if (workDialog.open) workDialog.close();
  currentWorkId = null;
  currentCollectionId = collection.id;
  text('collection-subtitle', collection.subtitle);
  text('collection-title', collection.title);
  text('collection-description', collection.description);
  const selected = collection.workIds.map(id => catalogue.works.find(work => work.id === id)).filter(Boolean);
  byId('collection-works').replaceChildren(...selected.map(work => {
    const button = make('button');
    button.type = 'button';
    button.dataset.openWork = work.id;
    button.setAttribute('aria-label', `View ${work.title}`);
    button.append(imageFor(work, true), make('span', '', work.title));
    return button;
  }));
  const product = catalogue.products.find(item => item.id === collection.productId);
  byId('collecting-details').hidden = !product;
  if (product) {
    text('collecting-title', product.title);
    text('product-description', product.description);
    const includedWorks = (product.workIds ?? []).map(id => catalogue.works.find(work => work.id === id)).filter(Boolean);
    text('product-included', includedWorks.length ? `Included in ${catalogue.site.mode === 'production' ? 'this' : 'the proposed'} download: ${includedWorks.map(work => work.title).join('; ')}. Other works in the exhibition above are not part of this download.` : '');
    const amount = new Intl.NumberFormat('en-GB', { style: 'currency', currency: product.price.currency, maximumFractionDigits: product.price.amount % 100 ? 2 : 0 }).format(product.price.amount / 100);
    byId('product-price').replaceChildren(document.createTextNode(amount), make('span', '', product.price.status === 'proposal' ? 'Proposed price · one digital collection' : 'One digital collection'));
    byId('product-contents').replaceChildren(...product.contents.map(item => make('li', '', item)));
    text('product-licence', product.licenceSummary);
    const checkoutUrl = checkoutFor(product, { mode: catalogue.site.mode });
    if (checkoutUrl) {
      const link = make('a', 'text-link checkout-link', 'Collect this digital selection ↗');
      link.href = checkoutUrl;
      link.rel = 'noopener noreferrer';
      byId('checkout-state').replaceChildren(link);
    } else {
      byId('checkout-state').replaceChildren(make('p', 'checkout-notice', checkoutNotice(catalogue.site.mode)));
    }
  }
  if (!collectionDialog.open) collectionDialog.showModal();
  collectionDialog.scrollTop = 0;
}

function syncRoute() {
  const route = resolveRoute(location.hash, catalogue.works, catalogue.collections);
  byId('route-notice').hidden = true;
  if (route.type === 'work') return renderWork(catalogue.works.find(work => work.id === route.id));
  if (route.type === 'collection') return renderCollection(catalogue.collections.find(collection => collection.id === route.id));
  closeDialogs(true);
  if (route.type === 'section') lastSection = routeHash(route);
  else {
    const notice = byId('route-notice');
    const link = make('a', '', 'Explore the collection.');
    link.href = '#explore';
    notice.replaceChildren(document.createTextNode('That gallery link does not match a work or collection in this selection. '), link);
    notice.hidden = false;
    byId('explore').scrollIntoView({ behavior: 'instant' });
  }
}

function moveWork(direction) {
  if (!currentWorkId) return;
  const navigationWorks = visibleWorks.some(item => item.id === currentWorkId) ? visibleWorks : catalogue.works;
  const id = nextWorkId(navigationWorks, currentWorkId, direction);
  if (id) navigate({ type: 'work', id });
}

function wireInteractions() {
  byId('gallery-filters').addEventListener('submit', event => event.preventDefault());
  byId('work-search').addEventListener('input', applyFilters);
  byId('kind-filter').addEventListener('change', applyFilters);
  byId('quality-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-quality]');
    if (!button) return;
    selectedQualities = toggleSelection(selectedQualities, button.dataset.quality);
    applyFilters();
  });
  byId('gallery-filters').addEventListener('reset', event => { event.preventDefault(); resetFilters(); });
  byId('empty-reset').addEventListener('click', () => { resetFilters(); byId('work-search').focus(); });
  document.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const workLink = event.target.closest('.work-link[data-work-id], [data-open-work]');
    if (workLink) {
      event.preventDefault();
      navigate({ type: 'work', id: workLink.dataset.workId ?? workLink.dataset.openWork }, workLink);
      return;
    }
    const collectionLink = event.target.closest('.collection-link[data-collection-id], #work-collection[data-collection-id]');
    if (collectionLink) {
      event.preventDefault();
      navigate({ type: 'collection', id: collectionLink.dataset.collectionId }, collectionLink);
    }
  });
  byId('previous-work').addEventListener('click', () => moveWork(-1));
  byId('next-work').addEventListener('click', () => moveWork(1));
  byId('close-work').addEventListener('click', requestClose);
  byId('close-collection').addEventListener('click', requestClose);
  for (const dialog of [workDialog, collectionDialog]) {
    dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose(); } });
  }
  workDialog.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveWork(event.key === 'ArrowLeft' ? -1 : 1); }
  });
  window.addEventListener('popstate', syncRoute);
  window.addEventListener('hashchange', syncRoute);
}

async function start() {
  try {
    const response = await fetch('./assets/catalogue.json');
    if (!response.ok) throw new Error('Catalogue unavailable');
    catalogue = await response.json();
    visibleWorks = catalogue.works;
    wireInteractions();
    document.body.dataset.enhanced = 'true';
    applyFilters();
    syncRoute();
  } catch {
    text('load-status', 'The interactive catalogue could not load. You can still explore every artwork below: select an image to open its complete preview.');
  }
}

start();
