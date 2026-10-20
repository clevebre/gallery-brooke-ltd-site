const sections = new Set(['arrival', 'explore', 'collections', 'about', 'visiting']);

export function parseRoute(hash = '') {
  const value = hash.replace(/^#/, '');
  if (!value) return { type: 'section', id: 'arrival' };
  if (sections.has(value)) return { type: 'section', id: value };
  const match = /^(work|collection)=(.*)$/.exec(value);
  if (!match) return { type: 'invalid', id: value };
  try {
    const id = decodeURIComponent(match[2]);
    return id ? { type: match[1], id } : { type: 'invalid', id: '' };
  } catch {
    return { type: 'invalid', id: '' };
  }
}

export function routeHash(route) {
  if (!route || typeof route.id !== 'string' || !route.id) throw new TypeError('A route needs an identifier.');
  if (route.type === 'section' && sections.has(route.id)) return `#${route.id}`;
  if (route.type === 'work' || route.type === 'collection') return `#${route.type}=${encodeURIComponent(route.id)}`;
  throw new TypeError('Unknown gallery route.');
}

export function resolveRoute(hash, works, collections) {
  const route = parseRoute(hash);
  if (route.type === 'work' && !works.some(work => work.id === route.id)) return { type: 'missing', id: route.id };
  if (route.type === 'collection' && !collections.some(collection => collection.id === route.id)) return { type: 'missing', id: route.id };
  return route;
}

export function toggleSelection(selected, value) {
  return selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value];
}

export function resultMessage(count, total) {
  if (!count) return 'No works match this view.';
  return count === total ? `${count} ${count === 1 ? 'work' : 'works'} to explore` : `${count} of ${total} works`;
}

export function titleNote(titleStatus, mode) {
  if (titleStatus !== 'editorial') return '';
  if (mode === 'development') return 'Working curatorial title';
  return mode === 'review' ? 'Proposed curatorial title' : 'Curatorial title';
}

export function checkoutNotice(mode) {
  if (mode === 'development') return 'In preparation, not on sale. Contents, price and licence terms are provisional. No payment is taken here.';
  return mode === 'review'
    ? 'In preparation, not on sale. This private review shows the proposed collection, price and terms. No payment is taken here.'
    : 'Not currently available to collect. No payment is taken here.';
}
