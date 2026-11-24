import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, Download, ExternalLink, Filter, Info, MapPin, Search, X } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { categories, csvText, territories } from './data.js';
import mapData from '../../model/territory-map.json';

const palette = ['#66896b', '#bd9b55', '#496f58', '#5b8882', '#7189a0', '#81779c'];
const categoryIndex = (name) => Math.max(0, categories.indexOf(name));
const formatArea = (value) => {
  const area = Number(value);
  return Number.isFinite(area)
    ? area.toLocaleString('bg-BG', { maximumFractionDigits: 4 })
    : '—';
};
const formatDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value || '—';
};

function InfoPopover({ label, text }) {
  const triggerRef = useRef(null);
  const [position, setPosition] = useState({ left: 0, top: 0, visible: false });

  const showPopover = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const bubbleWidth = Math.min(300, window.innerWidth - 24);
    const bubbleHeight = 92;
    const left = Math.max(12, Math.min(window.innerWidth - bubbleWidth - 12,
      rect.left + rect.width / 2 - bubbleWidth / 2));
    const preferredTop = rect.top - bubbleHeight - 10;
    const top = preferredTop >= 12
      ? preferredTop
      : Math.min(window.innerHeight - bubbleHeight - 12, rect.bottom + 10);
    setPosition({ left, top, visible: true });
  };

  const hidePopover = () => setPosition((current) => ({ ...current, visible: false }));

  return (
    <span className="info-popover">
      <button type="button" ref={triggerRef} className="info-popover-trigger" aria-label={label}
        onMouseEnter={showPopover} onMouseLeave={hidePopover}
        onFocus={showPopover} onBlur={hidePopover} onClick={(event) => {
          event.stopPropagation();
          if (position.visible) hidePopover();
          else showPopover();
        }}>
        <Info size={12} />
      </button>
      {position.visible && (
        <span className="info-popover-content" role="tooltip"
          style={{ left: position.left, top: position.top }}>{text}</span>
      )}
    </span>
  );
}

function TerritoryMap({ featureMap, visible, selectedId, fitTargetId, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const overlapClickRef = useRef({ x: null, y: null, index: 0 });
  const bounds = useMemo(() => [[41.20, 22.25], [44.25, 28.62]], []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      minZoom: 6,
      maxZoom: 18,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    map.fitBounds(bounds, { padding: [8, 8] });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [bounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (overlayRef.current) {
      map.removeLayer(overlayRef.current);
      overlayRef.current = null;
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', mapData.viewBox.join(' '));
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Защитени територии в България');

    mapData.features.forEach((feature) => {
      const row = featureMap.get(feature.id);
      if (!row || !visible.has(feature.id)) return;
      const selected = selectedId === feature.id;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', feature.d);
      path.setAttribute('fill', palette[categoryIndex(row.category_name)]);
      path.setAttribute('fill-opacity', selected ? '0.98' : '0.68');
      path.setAttribute('stroke', selected ? '#173d2d' : '#c9d4c5');
      path.setAttribute('fill-rule', 'evenodd');
      path.setAttribute('class', 'map-feature');
      path.dataset.sourceCode = feature.id;
      path.style.cursor = 'pointer';
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${row.name_bg} · ${row.category_name}`;
      path.appendChild(title);
      svg.appendChild(path);
    });

    const visiblePaths = Array.from(svg.querySelectorAll('.map-feature'));
    visiblePaths.forEach((path) => {
      const bounds = path.getBBox();
      const characteristicSize = Math.sqrt(bounds.width * bounds.height);
      const outlineWidth = Math.max(0.18, Math.min(1.1, characteristicSize * 0.018));
      path.setAttribute('stroke-width', outlineWidth.toFixed(2));
      path.style.setProperty('--outline-width', outlineWidth.toFixed(2));
    });

    // DOM order determines pointer hit priority. Reorder visible polygons from
    // largest to smallest so compact territories remain on top and clickable.
    const paths = Array.from(svg.querySelectorAll('.map-feature'));
    paths.sort((a, b) => {
      const aBox = a.getBBox();
      const bBox = b.getBBox();
      return (bBox.width * bBox.height) - (aBox.width * aBox.height);
    }).forEach((path) => svg.appendChild(path));

    if (selectedId) {
      const selectedPath = svg.querySelector(`[data-source-code="${selectedId}"]`);
      if (selectedPath) svg.appendChild(selectedPath);
    }

    const geoJsonFeatures = mapData.features
      .filter((feature) => visible.has(feature.id) && feature.geometry)
      .map((feature) => ({
        type: 'Feature',
        id: feature.id,
        properties: {
          id: feature.id,
          name: feature.name,
          category: feature.category,
        },
        geometry: feature.geometry,
      }));

    overlayRef.current = L.geoJSON(
      { type: 'FeatureCollection', features: geoJsonFeatures },
      {
        style: (geoJsonFeature) => {
          const row = featureMap.get(geoJsonFeature.id);
          const selected = selectedId === geoJsonFeature.id;
          return {
            color: selected ? '#173d2d' : '#c9d4c5',
            weight: selected ? 1.1 : 0.75,
            opacity: 1,
            fillColor: row ? palette[categoryIndex(row.category_name)] : '#66896b',
            fillOpacity: selected ? 0.22 : 0.68,
            interactive: selected ? false : true,
          };
        },
        onEachFeature: (geoJsonFeature, layer) => {
          const row = featureMap.get(geoJsonFeature.id);
          if (!row) return;
          if (selectedId === geoJsonFeature.id) {
            layer.options.interactive = false;
            if (layer._path) {
              layer._path.classList.remove('leaflet-interactive');
              layer._path.style.pointerEvents = 'none';
            }
            return;
          }
          layer.on('click', (event) => {
            L.DomEvent.stopPropagation(event);
            onSelect(row);
          });
          layer.bindTooltip(`${row.name_bg} · ${row.category_name}`, {
            sticky: true,
            direction: 'top',
          });
        },
      },
    ).addTo(map);

    if (selectedId) {
      const selectedLayer = overlayRef.current.getLayers()
        .find((layer) => layer.feature?.id === selectedId);
      if (selectedLayer?.bringToFront) selectedLayer.bringToFront();
    }

    if (fitTargetId) {
      const feature = mapData.features.find((item) => item.id === fitTargetId);
      if (feature?.bounds) {
        const [south, west, north, east] = feature.bounds;
        const latSpan = north - south;
        const lngSpan = east - west;
        const center = [(south + north) / 2, (west + east) / 2];
        if (latSpan < 0.0005 && lngSpan < 0.0005) {
          map.setView(center, 18, { animate: true });
        } else if (latSpan < 0.002 && lngSpan < 0.002) {
          map.setView(center, 17, { animate: true });
        } else {
          map.fitBounds([[south, west], [north, east]], {
            maxZoom: 15,
            paddingTopLeft: [80, 80],
            paddingBottomRight: [80, 80],
            animate: true,
          });
        }
      }
    }
  }, [featureMap, visible, selectedId, fitTargetId, onSelect, bounds]);

  return (
    <div ref={containerRef} className="interactive-map" role="application" aria-label="Карта на защитените територии в България" />
  );
}

function App() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Всички категории');
  const [status, setStatus] = useState('Всички граници');
  const [sortBy, setSortBy] = useState('area_ha');
  const [selected, setSelected] = useState(null);
  const [fitTargetId, setFitTargetId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [mapFiltered, setMapFiltered] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const counts = useMemo(() => ({
    total: territories.length,
    current: territories.filter((item) => item.boundary_status === 'актуална').length,
    updating: territories.filter((item) => item.boundary_status !== 'актуална').length,
  }), []);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('bg');
    return territories.filter((item) => {
      const matchesTerm = !term || [item.name_bg, item.registry_number, item.source_code, item.category_name]
        .some((value) => value?.toLocaleLowerCase('bg').includes(term));
      const matchesCategory = category === 'Всички категории' || item.category_name === category;
      const matchesStatus = status === 'Всички граници' || item.boundary_status === status;
      return matchesTerm && matchesCategory && matchesStatus;
    }).sort((a, b) => {
      if (sortBy === 'registry_number') return Number(a.registry_number) - Number(b.registry_number);
      if (sortBy === 'area_ha') {
        const areaA = Number(a.area_ha);
        const areaB = Number(b.area_ha);
        if (!Number.isFinite(areaA) && !Number.isFinite(areaB)) return a.name_bg.localeCompare(b.name_bg, 'bg');
        if (!Number.isFinite(areaA)) return 1;
        if (!Number.isFinite(areaB)) return -1;
        return areaB - areaA;
      }
      return a.name_bg.localeCompare(b.name_bg, 'bg');
    });
  }, [query, category, status, sortBy]);

  const featureMap = useMemo(() => new Map(territories.map((item) => [item.source_code, item])), []);
  const visible = useMemo(() => new Set((mapFiltered ? filtered : territories).map((item) => item.source_code)), [filtered, mapFiltered]);
  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob(['\ufeff', csvText], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'protected-areas.csv'; link.click(); URL.revokeObjectURL(url);
  };
  const clearFilters = () => { setQuery(''); setCategory('Всички категории'); setStatus('Всички граници'); };
  const hasFilters = query || category !== 'Всички категории' || status !== 'Всички граници';
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageButtons = Array.from({ length: pageCount }, (_, index) => index + 1)
    .filter((number) => number === 1 || number === pageCount || Math.abs(number - currentPage) <= 1);
  useEffect(() => { setPage(1); }, [query, category, status, sortBy]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top"><span className="brand-mark"><MapPin size={17} /></span><span>РЕГИСТЪР НА ЗАЩИТЕНИТЕ ТЕРИТОРИИ И ЗАЩИТЕНИТЕ ЗОНИ В БЪЛГАРИЯ</span></a>
        <div className="header-meta">БЪЛГАРИЯ <span /> {counts.total.toLocaleString('bg-BG')} ЗАПИСА</div>
        <button className="download-button" onClick={downloadCsv}><Download size={16} /> CSV</button>
      </header>

      <section className="summary" id="top">
        <div><h1>Регистър на защитените територии и защитените зони в България</h1><p>Интерактивен преглед на наличните защитени територии и техните граници.</p></div>
        <div className="summary-stats">
          <div><b>{counts.total.toLocaleString('bg-BG')}</b><span>ЗАПИСА</span></div>
          <div><b>{counts.current.toLocaleString('bg-BG')}</b><span>АКТУАЛНИ ГРАНИЦИ</span></div>
          <div><b>{counts.updating}</b><span>В АКТУАЛИЗАЦИЯ</span></div>
        </div>
      </section>

      <section className="explorer" id="explore">
        <div className="toolbar">
          <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Търси име, номер или код…" /></label>
          <button className={`filter-toggle ${showFilters ? 'pressed' : ''}`} onClick={() => setShowFilters(!showFilters)}><Filter size={16} /> Филтри <ChevronDown size={15} /></button>
          <label className="sort-select"><span>СОРТИРАНЕ</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="area_ha">По площ</option><option value="name_bg">По име</option><option value="registry_number">По номер</option></select></label>
        </div>
        {showFilters && <div className="filter-panel">
          <label>Категория<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Всички категории</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Статус на цифровите граници<select value={status} onChange={(event) => setStatus(event.target.value)}><option>Всички граници</option><option>актуална</option><option>в процес на актуализация</option></select></label>
          {hasFilters && <button className="clear-button" onClick={clearFilters}><X size={14} /> Изчисти</button>}
        </div>}

        <div className="explorer-grid">
          <section className="map-panel">
            <div className="panel-heading"><div><h2>Карта</h2><span>Граници от Регистъра на защитените територии и защитените зони в България</span></div><label className="map-filter"><input type="checkbox" checked={mapFiltered} onChange={(event) => setMapFiltered(event.target.checked)} /> Само резултатите</label></div>
            <div className="map-canvas"><TerritoryMap featureMap={featureMap} visible={visible} selectedId={selected?.source_code} fitTargetId={fitTargetId}
              onSelect={(item) => { setFitTargetId(null); setSelected(item); }} /></div>
            <div className="map-legend">{categories.map((item) => <span key={item}><i style={{ background: palette[categoryIndex(item)] }} />{item}</span>)}</div>
            <div className="map-attribution">Източник на контурите: Регистърът на защитените територии и защитените зони в България. Контурите са запазени в пълна детайлност от предоставения набор.</div>
          </section>

          <aside className="results-panel">
            <div className="panel-heading results-heading"><div><h2>Защитени територии</h2><span>{filtered.length.toLocaleString('bg-BG')} резултата</span></div><span className="last-update">Източник: ИАОС</span></div>
            <div className="table-wrap">
              <table><thead><tr><th>НАИМЕНОВАНИЕ</th><th>КАТЕГОРИЯ</th><th>№</th><th>ПЛОЩ, ХА</th><th><span className="label-with-info">СТАТУС НА ГРАНИЦАТА <InfoPopover label="Какво означава статусът на границата" text="Показва дали контурът в Държавния регистър е актуализиран или още се актуализира. Това е статус на картната граница, а не на самата защитена територия." /></span></th><th /></tr></thead>
                <tbody>{pageRows.map((item) => <tr key={item.source_code} onClick={() => { setSelected(item); setFitTargetId(item.source_code); }} className={selected?.source_code === item.source_code ? 'row-selected' : ''}>
                  <td><span className="territory-name">{item.name_bg}</span></td>
                  <td><span className="category-tag"><i style={{ background: palette[categoryIndex(item.category_name)] }} />{item.category_name}</span></td>
                  <td className="number-cell">{item.registry_number}</td>
                  <td className="number-cell">{formatArea(item.area_ha)}</td>
                  <td><span className={`status ${item.boundary_status === 'актуална' ? 'status-current' : 'status-review'}`}><i />{item.boundary_status}</span></td>
                  <td><button className="row-open" aria-label={`Покажи ${item.name_bg} на картата`}><ArrowUpRight size={16} /></button></td>
                </tr>)}</tbody>
              </table>
              {!filtered.length && <div className="empty-state"><h3>Няма намерени територии</h3><p>Промени търсенето или филтрите.</p><button onClick={clearFilters}>Изчисти филтрите</button></div>}
            </div>
            {filtered.length > 0 && <div className="pagination"><span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} от {filtered.length.toLocaleString('bg-BG')}</span><div className="page-controls">
              <button onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label="Предишна страница">‹</button>
              {pageButtons.map((number, index) => <Fragment key={number}>{index > 0 && pageButtons[index - 1] !== number - 1 && <span className="page-ellipsis">…</span>}<button className={number === currentPage ? 'active-page' : ''} onClick={() => setPage(number)} aria-current={number === currentPage ? 'page' : undefined}>{number}</button></Fragment>)}
              <button onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage === pageCount} aria-label="Следваща страница">›</button>
            </div></div>}
          </aside>
        </div>
      </section>

      <footer className="footer"><span>Данни: ИАОС · Пространствени граници от предоставения слой</span><a href="https://www.eea.government.bg/zpo/en/index.jsp" target="_blank" rel="noreferrer">Официален регистър <ExternalLink size={13} /></a></footer>

      {selected && <div className="drawer-backdrop" onClick={() => { setSelected(null); setFitTargetId(null); }}><aside className="detail-drawer" onClick={(event) => event.stopPropagation()}>
        <button className="drawer-close" onClick={() => { setSelected(null); setFitTargetId(null); }} aria-label="Затвори"><X size={19} /></button>
        <span className="drawer-code">{selected.source_code}</span><h2>{selected.name_bg}</h2>
        <span className="category-tag"><i style={{ background: palette[categoryIndex(selected.category_name)] }} />{selected.category_name}</span>
        <div className="detail-grid">
          <div><small>РЕГИСТЪР №</small><b>{selected.registry_number}</b></div>
          <div><small>КАТЕГОРИЯ</small><b>{selected.category_name}</b></div>
          <div><small className="label-with-info">СТАТУС НА ГРАНИЦАТА <InfoPopover label="Какво означава статусът на границата" text="Показва дали контурът в картния набор е актуален или се актуализира. „Актуална“ означава актуализирана граница. „В процес на актуализация“ означава, че контурът може да бъде променен по-късно." /></small><b>{selected.boundary_status || '—'}</b></div>
          {selected.area_ha && <div><small>ПЛОЩ (ХА)</small><b>{formatArea(selected.area_ha)}</b></div>}
          {selected.purpose && <div className="detail-full"><small>ЦЕЛ НА ОБЯВЯВАНЕ</small><b>{selected.purpose}</b></div>}
          {selected.designation_order && <div><small>ЗАПОВЕД №РД</small><b>{selected.designation_order}</b></div>}
          {selected.designation_date && <div><small>ДАТА НА ОБЯВЯВАНЕ</small><b>{formatDate(selected.designation_date)}</b></div>}
          {selected.state_gazette && <div><small>ДВ</small><b>{selected.state_gazette}</b></div>}
          {selected.regions && <div><small>ОБЛАСТ</small><b>{selected.regions}</b></div>}
          {selected.municipalities && <div><small>ОБЩИНА</small><b>{selected.municipalities}</b></div>}
          {selected.settlements && <div className="detail-full"><small>НАСЕЛЕНО МЯСТО</small><b>{selected.settlements}</b></div>}
          {selected.authority && <div><small>РИОСВ</small><b>{selected.authority}</b></div>}
        </div>
        <div className="detail-note"><MapPin size={17} /><span>Избраната защитена територия е маркирана на картата. <b>Категория:</b> {selected.category_name}. <b>Регистров номер:</b> {selected.registry_number}. Контурът е взет от Държавния регистър на защитените територии по ЗЗТ.</span></div>
        <a className="source-link" href={selected.source_url} target="_blank" rel="noreferrer">Отвори записа в ИАОС <ArrowUpRight size={16} /></a>
      </aside></div>}
    </main>
  );
}

export default App;
