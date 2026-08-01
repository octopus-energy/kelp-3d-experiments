// =====================================================================
// Property photo gallery for the ASHP sidebar: thumbnail grid with
// kind/room chips and a full-screen lightbox. Pure DOM — reads
// IMAGE_DATA, never writes anywhere.
//
// Near-duplicate photos (duplicateOf) collapse onto their primary and
// show as extra frames inside the lightbox instead of extra tiles.
// =====================================================================
window.SolarViz = window.SolarViz || {};

window.SolarViz.setupGallery = function ({ container, imageData }) {
  if (!imageData || !imageData.images || !imageData.images.length) {
    container.innerHTML = '<div class="scaffold-empty">No property photos.</div>';
    return;
  }
  const base = imageData.basePath || '';
  const all = imageData.images;
  const primaries = all.filter((im) => !im.duplicateOf);
  const dupsOf = (im) => all.filter((d) => d.duplicateOf === im.id);

  const KINDS = [
    { key: 'all', label: 'All' },
    { key: 'exterior', label: 'Exterior' },
    { key: 'interior', label: 'Interior' },
  ];
  let filter = 'all';

  const chips = document.createElement('div');
  chips.className = 'bm-gallery-chips';
  const grid = document.createElement('div');
  grid.className = 'bm-gallery-grid';
  container.appendChild(chips);
  container.appendChild(grid);

  KINDS.forEach((k) => {
    const b = document.createElement('button');
    b.textContent = k.label;
    b.className = k.key === filter ? 'active' : '';
    b.addEventListener('click', () => {
      filter = k.key;
      chips.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      renderGrid();
    });
    chips.appendChild(b);
  });

  function tileCaption(im) {
    if (im.kind === 'exterior') return 'Exterior · ' + (im.side || '?');
    if (im.room && im.room.label) return im.room.label;
    if (im.room) return im.room.type.charAt(0).toUpperCase() + im.room.type.slice(1) + ' (guess)';
    return im.kind;
  }

  function renderGrid() {
    grid.innerHTML = '';
    primaries
      .filter((im) => filter === 'all' || im.kind === filter)
      .forEach((im) => {
        const dups = dupsOf(im);
        const tile = document.createElement('div');
        tile.className = 'bm-gallery-tile';
        tile.innerHTML = `
          <img src="${base + im.file}" alt="" loading="lazy">
          ${dups.length ? `<span class="bm-gallery-count">×${dups.length + 1}</span>` : ''}
          <span class="bm-gallery-cap">${tileCaption(im)}</span>`;
        tile.addEventListener('click', () => openLightbox(im));
        grid.appendChild(tile);
      });
  }

  // -- lightbox --------------------------------------------------------
  let lb = null;
  function closeLightbox() {
    if (lb) { lb.remove(); lb = null; }
    window.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'Escape') closeLightbox();
  }
  function openLightbox(im) {
    closeLightbox();
    const frames = [im].concat(dupsOf(im));
    let idx = 0;
    lb = document.createElement('div');
    lb.className = 'bm-lightbox';
    lb.innerHTML = `
      <div class="bm-lightbox-inner">
        <img src="">
        <div class="bm-lightbox-meta">
          <div class="bm-lightbox-cap"></div>
          <div class="bm-lightbox-ev"></div>
        </div>
        ${frames.length > 1 ? '<button class="bm-lightbox-nav prev">‹</button><button class="bm-lightbox-nav next">›</button>' : ''}
        <button class="bm-lightbox-close">×</button>
      </div>`;
    const show = () => {
      const f = frames[idx];
      lb.querySelector('img').src = base + f.file;
      lb.querySelector('.bm-lightbox-cap').textContent = f.caption || tileCaption(f);
      lb.querySelector('.bm-lightbox-ev').textContent = f.evidence ? 'AI read: ' + f.evidence : '';
    };
    lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
    lb.querySelector('.bm-lightbox-close').addEventListener('click', closeLightbox);
    const prev = lb.querySelector('.prev'), next = lb.querySelector('.next');
    if (prev) prev.addEventListener('click', () => { idx = (idx + frames.length - 1) % frames.length; show(); });
    if (next) next.addEventListener('click', () => { idx = (idx + 1) % frames.length; show(); });
    window.addEventListener('keydown', onKey);
    document.body.appendChild(lb);
    show();
  }

  renderGrid();
};
