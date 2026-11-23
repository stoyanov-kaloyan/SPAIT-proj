import { useMemo, useState } from 'react';
import { ArrowDownUp, ArrowUpRight, ChevronDown, Compass, Download, ExternalLink, Filter, Leaf, MapPin, Search, ShieldCheck, X } from 'lucide-react';
import { categories, csvText, latestSourceDate, territories } from './data.js';

const categoryColor = {
  'Защитена местност': 'sage',
  'Природна забележителност': 'amber',
  'Резерват': 'forest',
  'Поддържан резерват': 'teal',
  'Природен парк': 'blue',
  'Национален парк': 'violet',
};

function App() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Всички категории');
  const [status, setStatus] = useState('Всички граници');
  const [sortBy, setSortBy] = useState('name_bg');
  const [selected, setSelected] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const counts = useMemo(() => ({
    total: territories.length,
    current: territories.filter((item) => item.boundary_status === 'актуална').length,
    updating: territories.filter((item) => item.boundary_status !== 'актуална').length,
    categoryCount: categories.length,
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

  const downloadCsv = () => {
    const blob = new Blob(['\ufeff', csvText], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'protected_territories.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => { setQuery(''); setCategory('Всички категории'); setStatus('Всички граници'); };
  const hasFilters = query || category !== 'Всички категории' || status !== 'Всички граници';

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Начало">
          <span className="brand-mark"><Leaf size={19} strokeWidth={1.8} /></span>
          <span>ЗЕЛЕНО ДЕЛО<small>ОТВОРЕНИ ДАННИ · БЪЛГАРИЯ</small></span>
        </a>
        <nav className="top-nav"><a className="nav-active" href="#explore">Регистър</a><a href="../sources_and_gaps.md">За данните</a></nav>
        <button className="download-button" onClick={downloadCsv}><Download size={16} /> <span>Изтегли CSV</span></button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> НАЦИОНАЛЕН РЕГИСТЪР</div>
          <h1>Природата<br /><em>има своите</em> граници.</h1>
          <p>Разгледай защитените територии в България — от резервати до природни паркове.</p>
          <a className="hero-link" href="#explore">Разгледай регистъра <ArrowDownUp size={15} /></a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="sun" />
          <div className="mountain mountain-back" />
          <div className="mountain mountain-front" />
          <div className="ridge ridge-one" /><div className="ridge ridge-two" />
          <div className="hero-stamp"><span>ЗАЩИТЕНО</span><ShieldCheck size={22} /><span>ПРИРОДНО</span></div>
          <div className="hero-coordinate">42°41′ С.Ш. &nbsp; 23°19′ И.Д.</div>
        </div>
        <div className="hero-index">01 <span>/</span> 06</div>
      </section>

      <section className="stats-row" aria-label="Обобщени данни">
        <div className="stat"><span className="stat-number">{counts.total.toLocaleString('bg-BG')}</span><span className="stat-label">ТЕРИТОРИИ В СЛОЯ</span></div>
        <div className="stat"><span className="stat-number">{counts.categoryCount.toString().padStart(2, '0')}</span><span className="stat-label">ЗАЩИТЕНИ КАТЕГОРИИ</span></div>
        <div className="stat"><span className="stat-number">{counts.current.toLocaleString('bg-BG')}</span><span className="stat-label">ГРАНИЦИ СТАТУС „АКТУАЛНА“</span></div>
        <div className="stat stat-note"><span className="live-dot" /> <span>Източник: ИАОС<br /><small>Слой с данни от {latestSourceDate} г.</small></span></div>
      </section>

      <section className="explorer" id="explore">
        <div className="section-heading">
          <div><div className="eyebrow"><span className="eyebrow-line" /> КАТАЛОГ НА ТЕРИТОРИИТЕ</div><h2>Намери своето място.</h2></div>
          <p>Данните са от публичния регистър на ИАОС.<br />Използвай търсене и филтрите, за да разгледаш записите.</p>
        </div>
        <div className="toolbar">
          <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Търси по име, номер или код..." /></label>
          <button className={`filter-toggle ${showFilters ? 'pressed' : ''}`} onClick={() => setShowFilters(!showFilters)}><Filter size={16} /> Филтри <ChevronDown size={15} /></button>
          <label className="sort-select"><span>СОРТИРАНЕ:</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="name_bg">По име</option><option value="registry_number">По номер</option></select></label>
        </div>
        {showFilters && <div className="filter-panel">
          <label>Категория<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Всички категории</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Статус на границата<select value={status} onChange={(event) => setStatus(event.target.value)}><option>Всички граници</option><option>актуална</option><option>в процес на актуализация</option></select></label>
          {hasFilters && <button className="clear-button" onClick={clearFilters}><X size={14} /> Изчисти</button>}
        </div>}
        <div className="results-line"><span>ПОКАЗАНИ <b>{filtered.length.toLocaleString('bg-BG')}</b> ОТ {counts.total.toLocaleString('bg-BG')} ЗАПИСА</span><span>ПОСЛЕДНО ОБНОВЯВАНЕ НА ИЗТОЧНИКА: 29.10.2026</span></div>
        <div className="table-wrap">
          <table><thead><tr><th>НАИМЕНОВАНИЕ</th><th>КАТЕГОРИЯ</th><th>РЕГИСТЪР №</th><th>СТАТУС НА ГРАНИЦАТА</th><th /></tr></thead>
            <tbody>{filtered.slice(0, 100).map((item) => <tr key={item.source_code} onClick={() => setSelected(item)} className={selected?.source_code === item.source_code ? 'row-selected' : ''}>
              <td><span className="territory-name">{item.name_bg}</span><span className="territory-code">КОД {item.source_code}</span></td>
              <td><span className={`category-tag ${categoryColor[item.category_name] || 'sage'}`}><i />{item.category_name}</span></td>
              <td className="number-cell">{item.registry_number}</td>
              <td><span className={`status ${item.boundary_status === 'актуална' ? 'status-current' : 'status-review'}`}><i />{item.boundary_status}</span></td>
              <td><button className="row-open" aria-label={`Детайли за ${item.name_bg}`}><ArrowUpRight size={17} /></button></td>
            </tr>)}</tbody>
          </table>
          {filtered.length === 0 && <div className="empty-state"><Compass size={28} /><h3>Няма намерени територии</h3><p>Опитай с друго име, номер или премахни филтрите.</p><button onClick={clearFilters}>Изчисти търсенето</button></div>}
        </div>
        {filtered.length > 100 && <div className="table-footer">Показани са първите 100 резултата. Стесни търсенето, за да намериш конкретен запис.</div>}
      </section>

      <footer className="footer"><div className="footer-brand"><span className="brand-mark"><Leaf size={17} /></span> ЗЕЛЕНО ДЕЛО</div><span>Учебен модел на публичен регистър · СПАИТ 2026</span><a href="https://www.eea.government.bg/zpo/en/index.jsp" target="_blank" rel="noreferrer">Официален регистър на ИАОС <ExternalLink size={13} /></a></footer>

      {selected && <div className="drawer-backdrop" onClick={() => setSelected(null)}><aside className="detail-drawer" onClick={(event) => event.stopPropagation()}>
        <button className="drawer-close" onClick={() => setSelected(null)} aria-label="Затвори"><X size={19} /></button>
        <div className="eyebrow"><span className="eyebrow-line" /> ДЕТАЙЛИ ЗА ОБЕКТА</div>
        <span className="drawer-code">{selected.source_code}</span><h2>{selected.name_bg}</h2>
        <span className={`category-tag ${categoryColor[selected.category_name] || 'sage'}`}><i />{selected.category_name}</span>
        <div className="detail-grid"><div><small>РЕГИСТЪР №</small><b>{selected.registry_number}</b></div><div><small>СТАТУС НА ГРАНИЦАТА</small><b>{selected.boundary_status}</b></div><div><small>НОМЕР НА СЛОЙ</small><b>{selected.partition_code}</b></div><div><small>КОНСИСТЕНТНОСТ НА КАТЕГОРИЯТА</small><b>{selected.category_code_consistent === 'true' ? 'Съвпада' : 'Несъответствие в източника'}</b></div></div>
        <div className="detail-note"><MapPin size={17} /><span>Площта, местоположението и правните актове не присъстват в текущия CSV слой. Отвори официалния запис за наличните допълнителни данни.</span></div>
        <a className="source-link" href={selected.source_url} target="_blank" rel="noreferrer">Отвори записа в ИАОС <ArrowUpRight size={16} /></a>
        {selected.map_url && <a className="source-link secondary-link" href={selected.map_url} target="_blank" rel="noreferrer">Отвори картата <ArrowUpRight size={16} /></a>}
      </aside></div>}
    </main>
  );
}

export default App;
