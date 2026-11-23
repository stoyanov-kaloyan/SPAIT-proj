import csvText from '../../protected_territories.csv?raw';
export { csvText };

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += char;
  }
  if (value.length || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  const [headers, ...records] = rows;
  // Excel-compatible UTF-8 CSV files may begin with a BOM.  Remove it from
  // the first header so source_code remains a usable property name.
  headers[0] = headers[0].replace(/^\uFEFF/, '');
  return records.filter((record) => record.length === headers.length)
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index]])));
}

export const territories = parseCsv(csvText);
export const categories = [...new Set(territories.map((item) => item.category_name))].sort((a, b) => a.localeCompare(b, 'bg'));
export const latestSourceDate = '29 октомври 2026';
