// Classic-script property loading works over HTTP and directly from file://.
// Only the selected property's data is loaded; changing address reloads the
// scene so no geometry, image cache or in-progress tools leak between sites.
window.SolarViz = window.SolarViz || {};
(function (SV) {
  const properties = [
    { id: 'original', label: 'Original property · PO19 5DZ',
      scripts: ['data/site-data.js', 'data/image-data.js', 'data/image-blobs.js'],
      dsm: { ncols: 400, nrows: 400, cellsize: 0.25, xll: 485562, yll: 106428, nodata: -9999 } },
    { id: '3broomroad', label: '3 Broom Road · WA15 9AR',
      scripts: ['3broomroad-data/property-bundle.js','3broomroad-data/reconstruction/bundle.js','3broomroad-data/reconstruction/workflow-bundle.js'],
      note: 'Remote reconstruction available in ASHP.' },
  ];
  const requested = new URLSearchParams(window.location.search).get('property') || 'original';
  const selected = properties.find(p => p.id === requested);
  const selector = document.getElementById('property-select');
  properties.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.label;
    selector.appendChild(option);
  });
  selector.value = selected ? selected.id : '';
  selector.addEventListener('change', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('property', selector.value);
    window.location.href = url.href;
  });

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load '+src+'. Check that the property bundle is present.'));
      document.head.appendChild(script);
    });
  }
  SV.propertyReady = (async function () {
    if (!selected) throw new Error('Unknown property "'+requested+'". Choose an address in the sidebar.');
    if (selected.dsm) window.__DSM_META__ = selected.dsm;
    for (const src of selected.scripts) await loadScript(src);
    SV.currentProperty = selected;
    const reconstructionLink = document.getElementById('bm-reconstruction');
    if (reconstructionLink) reconstructionLink.hidden = selected.id !== '3broomroad';
    const site = window.SITE_DATA;
    const addr = site.property_details.geocoded_address;
    document.title = 'Solar Site 3D — '+selected.label;
    document.getElementById('site-heading').textContent = selected.label;
    document.getElementById('site-coordinates').textContent = 'Lat '+addr.latitude.toFixed(5)+' · Lon '+addr.longitude.toFixed(5);
    const stats = {
      outcome: site.outcome,
      confidence: Math.round(site.confidence_ratio*100)+'%',
      storeys: site.number_of_storeys,
      ridge: site.property_details.ridge_height+' m',
      panels: site.total_number_of_panels,
      output: site.total_annual_generation_kwh.toLocaleString('en-GB')+' kWh',
    };
    Object.keys(stats).forEach(key => { document.getElementById('site-'+key).textContent = stats[key]; });
    const note = document.getElementById('property-note');
    note.textContent = selected.note || '';
    note.hidden = !selected.note;
  })();
  // main.js awaits this promise and displays errors after all modules load.
  SV.propertyReady.catch(() => {});
})(window.SolarViz);
