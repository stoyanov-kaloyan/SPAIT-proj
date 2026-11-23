import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, ArrowUpRight, ChevronDown, Download, ExternalLink, Filter, MapPin, Search, X } from 'lucide-react';
import { categories, csvText, latestSourceDate, territories } from './data.js';
import mapData from './territory-map.json';

const palette = ['#66896b', '#bd9b55', '#496f58', '#5b8882', '#7189a0', '#81779c'];
const categoryIndex = (name) => Math.max(0, categories.indexOf(name));

function TerritoryMap({ featureMap, visible, selectedId, onSelect }) {
  const viewBox = mapData.viewBox.join(' ');
  return (
    <svg className="map-svg" viewBox={viewBox} role="img" aria-label="Карта на защитените територии в България" preserveAspectRatio="xMidYMid meet">
      {mapData.features.map((feature) => {
        const row = featureMap.get(feature.id);
        if (!row || !visible.has(feature.id)) return null;
        const selected = selectedId === feature.id;
        return <path key={feature.id} d={feature.d} fill={selected ? '#173d2d' : palette[categoryIndex(row.category_name)]}
          fillOpacity={selected ? 0.95 : 0.68} stroke={selected ? '#f6f8f4' : '#dbe3d8'} strokeWidth={selected ? 2.5 : 0.7}
          fillRule="evenodd" className="map-feature"
          onClick={() => onSelect(row)}><title>{row.name_bg} · {row.category_name}</title></path>;
      })}
    </svg>
  );
}

function App() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Всички категории');
  const [status, setStatus] = useState('Всички граници');
  const [sortBy, setSortBy] = useState('name_bg');
  const [selected, setSelected] = useState(null);
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
    }).sort((a, b) => sortBy === 'registry_number'
      ? Number(a.registry_number) - Number(b.registry_number)
      : a.name_bg.localeCompare(b.name_bg, 'bg'));
  }, [query, category, status, sortBy]);

  const featureMap = useMemo(() => new Map(territories.map((item) => [item.source_code, item])), []);
  const visible = useMemo(() => new Set((mapFiltered ? filtered : territories).map((item) => item.source_code)), [filtered, mapFiltered]);
  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob(['\ufeff', csvText], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'protected_territories.csv'; link.click(); URL.revokeObjectURL(url);
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
        <a className="brand" href="#top"><span className="brand-mark"><MapPin size={17} /></span><span>РЕГИСТЪР НА ЗАЩИТЕНИТЕ ТЕРИТОРИИ</span></a>
        <div className="header-meta">БЪЛГАРИЯ <span /> {counts.total.toLocaleString('bg-BG')} ЗАПИСА</div>
        <button className="download-button" onClick={downloadCsv}><Download size={16} /> CSV</button>
      </header>

      <section className="summary" id="top">
        <div><h1>Защитени територии</h1><p>Интерактивен преглед на наличните записи и граници.</p></div>
        <div className="summary-stats"><div><b>{counts.total.toLocaleString('bg-BG')}</b><span>ЗАПИСА</span></div><div><b>{counts.current.toLocaleString('bg-BG')}</b><span>АКТУАЛНИ ГРАНИЦИ</span></div><div><b>{counts.updating}</b><span>В АКТУАЛИЗАЦИЯ</span></div></div>
      </section>

      <section className="explorer" id="explore">
        <div className="toolbar">
          <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Търси име, номер или код…" /></label>
          <button className={`filter-toggle ${showFilters ? 'pressed' : ''}`} onClick={() => setShowFilters(!showFilters)}><Filter size={16} /> Филтри <ChevronDown size={15} /></button>
          <label className="sort-select"><span>СОРТИРАНЕ</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="name_bg">По име</option><option value="registry_number">По номер</option></select></label>
        </div>
        {showFilters && <div className="filter-panel">
          <label>Категория<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Всички категории</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Статус на границата<select value={status} onChange={(event) => setStatus(event.target.value)}><option>Всички граници</option><option>актуална</option><option>в процес на актуализация</option></select></label>
          {hasFilters && <button className="clear-button" onClick={clearFilters}><X size={14} /> Изчисти</button>}
        </div>}

        <div className="explorer-grid">
          <section className="map-panel">
            <div className="panel-heading"><div><h2>Карта</h2><span>Граници от предоставения GIS слой · EPSG:32635</span></div><label className="map-filter"><input type="checkbox" checked={mapFiltered} onChange={(event) => setMapFiltered(event.target.checked)} /> Само резултатите</label></div>
            <div className="map-canvas"><TerritoryMap featureMap={featureMap} visible={visible} selectedId={selected?.source_code} onSelect={setSelected} /></div>
            <div className="map-legend">{categories.map((item) => <span key={item}><i style={{ background: palette[categoryIndex(item)] }} />{item}</span>)}</div>
            <div className="map-attribution">Геометрия: предоставен Shapefile `zpo_all`. Контурите са опростени за уеб визуализация.</div>
          </section>

          <aside className="results-panel">
            <div className="panel-heading results-heading"><div><h2>Територии</h2><span>{filtered.length.toLocaleString('bg-BG')} резултата</span></div><span className="last-update">Източник: ИАОС<br />{latestSourceDate}</span></div>
            <div className="table-wrap">
              <table><thead><tr><th>НАИМЕНОВАНИЕ</th><th>КАТЕГОРИЯ</th><th>№</th><th>ГРАНИЦА</th><th /></tr></thead>
                <tbody>{pageRows.map((item) => <tr key={item.source_code} onClick={() => setSelected(item)} className={selected?.source_code === item.source_code ? 'row-selected' : ''}>
                  <td><span className="territory-name">{item.name_bg}</span></td>
                  <td><span className="category-tag"><i style={{ background: palette[categoryIndex(item.category_name)] }} />{item.category_name}</span></td>
                  <td className="number-cell">{item.registry_number}</td>
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

      {selected && <div className="drawer-backdrop" onClick={() => setSelected(null)}><aside className="detail-drawer" onClick={(event) => event.stopPropagation()}>
        <button className="drawer-close" onClick={() => setSelected(null)} aria-label="Затвори"><X size={19} /></button>
        <span className="drawer-code">{selected.source_code}</span><h2>{selected.name_bg}</h2>
        <span className="category-tag"><i style={{ background: palette[categoryIndex(selected.category_name)] }} />{selected.category_name}</span>
        <div className="detail-grid"><div><small>РЕГИСТЪР №</small><b>{selected.registry_number}</b></div><div><small>СТАТУС НА ГРАНИЦАТА</small><b>{selected.boundary_status}</b></div><div><small>КАТЕГОРИЯ</small><b>{selected.category_name}</b></div><div><small>СЪГЛАСУВАНОСТ НА КАТЕГОРИЯТА</small><b>{selected.category_code_consistent === 'true' ? 'Да' : 'Несъответствие в източника'}</b></div></div>
        <div className="detail-note"><MapPin size={17} /><span>Избраният контур е маркиран на картата. Този CSV слой не съдържа площ, местоположение или данни за правните актове.</span></div>
        <a className="source-link" href={selected.source_url} target="_blank" rel="noreferrer">Отвори записа в ИАОС <ArrowUpRight size={16} /></a>
      </aside></div>}
    </main>
  );
}

export default App;
