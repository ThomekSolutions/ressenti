export const BACKUP_VERSION = 1;
export const MAX_COUNT = 9999;
export const MAX_LABEL = 80;
export const MAX_NOTE = 2000;

const dateParts = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'long', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'full', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function today(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index ? 2 : 4, '0')).join('-');
}

export function validDate(value) {
  if (typeof value !== 'string' || !isoDatePattern.test(value) || value < '0001-01-01') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function addDays(date, amount) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result.toISOString().slice(0, 10);
}

export function formatDate(date, weekday = false) {
  return (weekday ? fullDate : dateParts).format(new Date(date));
}

export function formatMonth(month) {
  return monthFormat.format(new Date(month + '-01'));
}

export function shiftMonth(month, amount) {
  const date = new Date(month + '-01');
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

export function cleanLabel(value) {
  return value.trim().replace(/\s+/gu, ' ').normalize('NFC');
}

export function labelKey(value) {
  return cleanLabel(value).toLocaleLowerCase('fr-BE');
}

export function emptyState() {
  return { symptoms: [], days: {}, lastBackup: null };
}

export function orderedSymptoms(state) {
  return state.symptoms.filter(symptom => symptom.favorite);
}

export function draftRows(state, date) {
  const day = state.days[date];
  return day?.draft ?? day?.saved?.rows ?? [];
}

export function setDraft(state, date, rows) {
  const day = state.days[date] ?? {};
  day.draft = rows;
  state.days[date] = day;
}

export function saveDay(state, date, status) {
  const rows = status === 'symptoms' ? draftRows(state, date) : [];
  if (status === 'symptoms' && rows.length === 0) throw new Error('Ajoutez au moins un symptôme.');
  state.days[date] = { saved: { status, rows } };
}

export function discardDraft(state, date) {
  const day = state.days[date];
  if (day?.saved) state.days[date] = { saved: day.saved };
  else delete state.days[date];
}

export function addSymptom(state, name, favorite) {
  const label = cleanLabel(name);
  if (!label || label.length > MAX_LABEL) throw new Error('Indiquez un nom de 1 à 80 caractères.');
  let symptom = state.symptoms.find(item => labelKey(item.label) === labelKey(label));
  if (!symptom) {
    symptom = { id: crypto.randomUUID(), label, favorite };
    state.symptoms.push(symptom);
  }
  if (favorite) symptom.favorite = true;
  return symptom;
}

export function addRow(state, date, id) {
  if (!state.symptoms.some(item => item.id === id)) throw new Error('Ce symptôme n’existe plus.');
  const rows = draftRows(state, date);
  if (!rows.some(row => row.id === id)) setDraft(state, date, [...rows, { id, count: 1, note: '' }]);
}

export function reportFor(state, start, end) {
  if (!validDate(start) || !validDate(end) || start > end) throw new Error('Choisissez une période valide.');
  const coverage = { symptoms: 0, none: 0, missing: 1 + (Date.parse(end) - Date.parse(start)) / 86400000, draft: 0 };
  const labels = new Map(state.symptoms.map(item => [item.id, item.label]));
  const totals = new Map();
  const details = [];

  for (const date of Object.keys(state.days).sort()) {
    if (date < start || date > end) continue;
    const day = state.days[date];
    coverage.missing--;
    if (!day.saved) {
      coverage.draft++;
      continue;
    }
    coverage[day.saved.status]++;
    if (day.saved.status === 'none') continue;

    const rows = day.saved.rows.map(row => {
      const label = labels.get(row.id);
      const total = totals.get(row.id) ?? { label, count: 0, days: 0 };
      total.count += row.count;
      total.days++;
      totals.set(row.id, total);
      return { label, count: row.count, note: row.note };
    });
    details.push({ date, rows });
  }
  const summary = Array.from(totals.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));
  return { start, end, coverage, summary, details };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function makeBackup(state, now = new Date()) {
  return {
    format: 'journal-epilepsie',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    symptoms: state.symptoms,
    days: state.days,
  };
}

export function readBackup(json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Ce fichier ne contient pas une sauvegarde lisible.');
  }
  if (!isRecord(raw) || raw.format !== 'journal-epilepsie') throw new Error('Ce fichier ne provient pas de ce journal.');
  if (raw.version !== BACKUP_VERSION) throw new Error('Cette version de sauvegarde est incompatible.');
  const invalid = () => { throw new Error('Cette sauvegarde est incomplète ou endommagée.'); };
  if (!Array.isArray(raw.symptoms) || !isRecord(raw.days)) invalid();
  if (typeof raw.exportedAt !== 'string' || !Number.isFinite(Date.parse(raw.exportedAt))) invalid();
  const ids = new Set();
  const names = new Set();
  const symptoms = raw.symptoms.map(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || !/^[\w-]{1,100}$/.test(item.id) || ids.has(item.id)
      || typeof item.label !== 'string' || !cleanLabel(item.label) || item.label.length > MAX_LABEL
      || names.has(labelKey(item.label)) || typeof item.favorite !== 'boolean') invalid();
    ids.add(item.id);
    names.add(labelKey(item.label));
    return { id: item.id, label: cleanLabel(item.label), favorite: item.favorite };
  });

  function readRows(rows) {
    if (!Array.isArray(rows)) invalid();
    const used = new Set();
    return rows.map(row => {
      if (!isRecord(row) || !ids.has(row.id) || used.has(row.id) || !Number.isInteger(row.count)
        || row.count < 1 || row.count > MAX_COUNT || typeof row.note !== 'string' || row.note.length > MAX_NOTE) invalid();
      used.add(row.id);
      return { id: row.id, count: row.count, note: row.note };
    });
  }

  const days = {};
  for (const [date, day] of Object.entries(raw.days)) {
    if (!validDate(date) || !isRecord(day) || (day.saved === undefined && day.draft === undefined)) invalid();
    const result = {};
    if (day.saved !== undefined) {
      if (!isRecord(day.saved) || !['symptoms', 'none'].includes(day.saved.status)) invalid();
      const rows = readRows(day.saved.rows);
      if ((day.saved.status === 'symptoms') !== (rows.length > 0)) invalid();
      result.saved = { status: day.saved.status, rows };
    }
    if (day.draft !== undefined) result.draft = readRows(day.draft);
    days[date] = result;
  }
  return { symptoms, days, lastBackup: null };
}

export function coverageItems(coverage) {
  return [
    { label: 'Avec symptômes', count: coverage.symptoms },
    { label: 'Rien à signaler', count: coverage.none },
    { label: 'Non renseignés', count: coverage.missing },
    { label: 'En brouillon', count: coverage.draft },
  ];
}
