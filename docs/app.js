import {
  MAX_COUNT, MAX_LABEL, MAX_NOTE, addDays, addRow, addSymptom, cleanLabel, coverageItems, discardDraft,
  draftRows, formatDate, formatMonth, labelKey, makeBackup, orderedSymptoms, readBackup,
  reportFor, saveDay, setDraft, shiftMonth, today, validDate,
} from './model.js';
import { loadJournal, updateJournal } from './storage.js';

const main = document.querySelector('#main');
const dialog = document.querySelector('#dialog');
const message = document.querySelector('#message');
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(location.pathname.replace(/index\.html$/, '') + ':journal') : null;
const views = ['journee', 'historique', 'rapport', 'reglages'];
const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const number = new Intl.NumberFormat('fr-BE');
const plural = (count, singular, multiple = singular + 's') => number.format(count) + ' ' + (count === 1 ? singular : multiple);
const button = (action, label, className = 'secondary', extra = '') =>
  `<button type="button" class="${className}" data-action="${action}" ${extra}>${label}</button>`;
const heading = (title, description = '') =>
  `<header class="page-heading"><h1>${title}</h1>${description ? `<p>${description}</p>` : ''}</header>`;

let state;
let date = today();
let lastCalendarDay = date;
let historyMonth = date.slice(0, 7);
let range = { start: addDays(today(), -29), end: today() };
let queue = Promise.resolve();
let toastTimer;
let dialogAction;
let pendingFocus;

function view() {
  const hash = location.hash.slice(1);
  return views.includes(hash) ? hash : 'journee';
}

function say(text) {
  clearTimeout(toastTimer);
  message.textContent = text;
  message.classList.add('visible');
  toastTimer = setTimeout(() => message.classList.remove('visible'), 4200);
}

function mutate(update, options = {}) {
  const requestedView = view();
  const requestedDate = date;
  const operation = queue.then(async () => {
    state = await updateJournal(update);
    channel?.postMessage('change');
    if (options.render !== false && view() === requestedView && (view() !== 'journee' || date === requestedDate)) {
      render();
      options.after?.();
    }
    if (options.message) say(options.message);
    return true;
  });
  queue = operation.catch(error => {
    say(error?.name === 'QuotaExceededError' ? 'Le stockage est plein. Libérez de la place puis réessayez.'
      : error?.name === 'Error' ? error.message : 'Enregistrement impossible. Réessayez.');
    return false;
  });
  return queue;
}

function dayStatus(day) {
  if ('draft' in (day ?? {})) return { kind: 'draft', label: 'Brouillon' };
  if (day?.saved?.status === 'symptoms') return { kind: 'symptoms', label: 'Avec symptômes' };
  if (day?.saved?.status === 'none') return { kind: 'none', label: 'Rien à signaler' };
  return { kind: 'missing', label: 'Non renseignée' };
}

function statusLabel(status) {
  return `<span class="status ${status.kind}"><span class="status-dot"></span>${status.label}</span>`;
}

function rowsMarkup(rows) {
  return rows.map(row => {
    const name = escape(state.symptoms.find(symptom => symptom.id === row.id).label);
    return `<li class="event" data-row="${row.id}">
      <div class="event-top">
        <strong>${name}</strong>
        ${button('remove-row', '×', 'icon-button remove', `data-id="${row.id}" aria-label="Retirer ${name}"`)}
      </div>
      <div class="event-actions">
        <div class="stepper" role="group" aria-label="Nombre de fois pour ${name}">
          ${button('decrease', '−', 'step', `data-id="${row.id}" aria-label="Diminuer le nombre pour ${name}" aria-disabled="${row.count <= 1}"`)}
          <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${String(MAX_COUNT).length}" value="${row.count}" data-count="${row.id}" aria-label="Nombre de fois pour ${name}" autocomplete="off">
          ${button('increase', '+', 'step', `data-id="${row.id}" aria-label="Augmenter le nombre pour ${name}" aria-disabled="${row.count >= MAX_COUNT}"`)}
        </div>
        <details ${row.note ? 'open' : ''}>
          <summary>${row.note ? 'Note' : 'Ajouter une note'}</summary>
          <label class="sr-only" for="note-${row.id}">Note pour ${name}</label>
          <textarea id="note-${row.id}" data-note="${row.id}" maxlength="${MAX_NOTE}" rows="2" placeholder="Ex. deux fois le matin">
${escape(row.note)}</textarea>
        </details>
      </div>
    </li>`;
  }).join('');
}

function dayPage() {
  const now = today();
  const day = state.days[date] ?? {};
  const rows = draftRows(state, date);
  const quick = orderedSymptoms(state);
  const status = dayStatus(day);
  const title = date.slice(0, 4) === now.slice(0, 4) ? formatDate(date, true).replace(/ \d{4}$/, '') : formatDate(date, true);
  return `<div class="page-heading day-heading">
      <div class="day-overline">${date === now ? 'AUJOURD’HUI' : date === addDays(now, -1) ? 'HIER' : 'JOURNAL'}</div>
      <h1>${title}</h1>
      ${statusLabel(status)}
    </div>
    <div class="date-bar">
      <div class="date-shortcuts" aria-label="Dates rapides">
        ${button('choose-today', 'Aujourd’hui', 'date-shortcut', `aria-pressed="${date === now}"`)}
        ${button('choose-yesterday', 'Hier', 'date-shortcut', `aria-pressed="${date === addDays(now, -1)}"`)}
      </div>
      <label class="date-inline"><span class="sr-only">Date de la journée</span><input type="date" id="day-date" value="${date}" min="0001-01-01" max="${now}"></label>
    </div>
    <section class="card entry-card" aria-labelledby="entry-title">
      <div class="section-head">
        <h2 id="entry-title">Symptômes</h2>
        ${rows.length ? `<span class="muted small">${plural(rows.length, 'symptôme')}</span>` : ''}
      </div>
      ${rows.length ? '' : `<p class="muted empty-line">${status.kind === 'none' ? 'Cette journée est enregistrée sans symptôme.' : 'Ajoutez ce que vous avez ressenti dans la journée.'}</p>`}
      ${quick.length ? `<div class="quick-list" aria-label="Symptômes favoris">${quick.map(item => {
        const listed = rows.some(row => row.id === item.id);
        return button('quick-add', `<span aria-hidden="true">${listed ? '✓' : '+'}</span> ${escape(item.label)}`,
          'chip', `data-id="${item.id}" aria-pressed="${listed}"`);
      }).join('')}</div>` : ''}
      ${button('new-entry', '<span aria-hidden="true">+</span> ' + (quick.length ? 'Autre symptôme' : 'Ajouter un symptôme'),
        quick.length ? 'text-button add-other' : 'secondary add-first')}
      ${rows.length ? `<ul class="event-list">${rowsMarkup(rows)}</ul>` : ''}
    </section>
    <div class="save-actions">
      ${rows.length ? button('save-day', day.saved ? 'Enregistrer les modifications' : 'Enregistrer la journée', 'primary')
        : ''}
      ${!rows.length || day.draft !== undefined || day.saved?.status !== 'none'
        ? button('no-symptoms', 'Rien à signaler', rows.length ? 'text-button' : 'secondary none-button',
          day.saved?.status === 'none' && day.draft === undefined ? 'disabled' : '')
        : ''}
      ${day.draft !== undefined ? button('discard-draft', 'Annuler le brouillon', 'text-button subdued') : ''}
      ${day.saved && day.draft === undefined ? button('unrecord-day', 'Remettre la journée à non renseignée', 'text-button subdued') : ''}
    </div>`;
}

function historyPage() {
  const now = today();
  const first = historyMonth + '-01';
  const offset = (new Date(first).getUTCDay() + 6) % 7;
  const nextMonth = shiftMonth(historyMonth, 1);
  const days = new Date(addDays(nextMonth + '-01', -1)).getUTCDate();
  const cells = Array.from({ length: offset }, () => '<span aria-hidden="true"></span>');
  for (let day = 1; day <= days; day++) {
    const key = historyMonth + '-' + String(day).padStart(2, '0');
    const status = dayStatus(state.days[key]);
    cells.push(button('open-day', `<span>${day}</span><span class="marker" aria-hidden="true"></span>`,
      `calendar-cell ${status.kind}${key === now ? ' is-today' : ''}`,
      `data-date="${key}" aria-label="${formatDate(key, true)}${key <= now ? ' · ' + status.label : ''}" ${key > now ? 'disabled' : ''}`));
  }

  const recorded = Object.keys(state.days).filter(key => key.startsWith(historyMonth) && key <= now).sort().reverse();
  return `${heading('Historique', 'Retrouvez et corrigez vos journées.')}
    <section class="card calendar" aria-labelledby="month-name">
      <div class="calendar-heading">
        ${button('previous-month', '&#8249;', 'icon-button month-step', `aria-label="Mois précédent" ${historyMonth <= '0001-01' ? 'disabled' : ''}`)}
        <h2 id="month-name">${formatMonth(historyMonth)}</h2>
        ${button('next-month', '&#8250;', 'icon-button month-step', `aria-label="Mois suivant" ${historyMonth >= now.slice(0, 7) ? 'disabled' : ''}`)}
      </div>
      <div class="calendar-grid calendar-week" aria-hidden="true">${['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'].map(name => `<span>${name}</span>`).join('')}</div>
      <div class="calendar-grid">${cells.join('')}</div>
      <div class="calendar-legend">${['symptoms', 'none', 'draft', 'missing'].map(kind =>
        statusLabel(dayStatus({ symptoms: { saved: { status: 'symptoms' } }, none: { saved: { status: 'none' } }, draft: { draft: [] } }[kind]))).join('')}</div>
    </section>
    <section class="history-list" aria-labelledby="history-list-title">
      <h2 id="history-list-title">Journées du mois</h2>
      ${recorded.length ? `<ul class="card list">${recorded.map(key => `<li>${button('open-day',
        `<span>${formatDate(key, true)}</span>${statusLabel(dayStatus(state.days[key]))}`, 'history-row', `data-date="${key}"`)}</li>`).join('')}</ul>`
        : '<p class="muted">Aucune journée saisie ce mois-ci.</p>'}
    </section>`;
}

function reportPage() {
  const now = today();
  const valid = validDate(range.start) && validDate(range.end) && range.start <= range.end && range.end <= now;
  const report = valid ? reportFor(state, range.start, range.end) : null;
  return `${heading('Rapport', 'Préparez un récapitulatif pour votre neurologue.')}
    <section class="card report-dates" aria-labelledby="period-title">
      <h2 id="period-title">Période</h2>
      <div class="date-fields">
        <label>Du<input type="date" id="report-start" value="${escape(range.start)}" min="0001-01-01" max="${now}"></label>
        <label>Au<input type="date" id="report-end" value="${escape(range.end)}" min="0001-01-01" max="${now}"></label>
      </div>
      <div class="period-actions">${button('last-month', '30 derniers jours', 'text-button')}${button('all-time', 'Depuis le début', 'text-button')}</div>
      ${report ? button('pdf', 'Exporter le PDF', 'primary full-width report-export')
        : '<p class="error" role="status">Choisissez une période valide qui se termine au plus tard aujourd’hui.</p>'}
    </section>
    ${report ? `
      <section class="card report-summary" aria-labelledby="coverage-title">
        <h2 id="coverage-title">Journées sur la période</h2>
        <dl class="coverage">${coverageItems(report.coverage).map(item =>
          `<div><dt>${item.label}</dt><dd>${number.format(item.count)}</dd></div>`).join('')}</dl>
      </section>
      <section class="card report-summary" aria-labelledby="summary-title">
        <h2 id="summary-title">Par symptôme</h2>
        ${report.summary.length ? `<ul class="list report-list">${report.summary.map(item =>
          `<li><strong>${escape(item.label)}</strong><span>${plural(item.count, 'occurrence')} sur ${plural(item.days, 'jour')}</span></li>`).join('')}</ul>`
          : '<p class="muted">Aucun symptôme enregistré sur cette période.</p>'}
      </section>
      ${report.details.length ? `<section class="card report-summary" aria-labelledby="details-title">
        <h2 id="details-title">Détail par jour</h2>
        ${report.details.map(day => `<div class="report-day"><h3>${formatDate(day.date, true)}</h3>
          <ul class="list report-list">${day.rows.map(row => `<li><strong>${escape(row.label)}</strong><span>${plural(row.count, 'fois', 'fois')}</span>
            ${row.note ? `<p class="note-text">${escape(row.note)}</p>` : ''}</li>`).join('')}</ul></div>`).join('')}
      </section>` : ''}` : ''}`;
}

function settingsPage() {
  const favorites = orderedSymptoms(state);
  return `${heading('Réglages')}
    <section class="card settings-card" aria-labelledby="favorites-title">
      <h2 id="favorites-title">Symptômes favoris</h2>
      <p class="muted">Retrouvez-les en accès rapide dans la saisie du soir.</p>
      ${favorites.length ? `<ul class="list favorite-list">${favorites.map((item, index) => `<li>
        <strong>${escape(item.label)}</strong>
        <div class="favorite-actions">
          ${button('favorite-up', '&#8593;', 'icon-button', `data-id="${item.id}" aria-label="Monter ${escape(item.label)}" ${index === 0 ? 'disabled' : ''}`)}
          ${button('favorite-down', '&#8595;', 'icon-button', `data-id="${item.id}" aria-label="Descendre ${escape(item.label)}" ${index === favorites.length - 1 ? 'disabled' : ''}`)}
          ${button('rename', 'Modifier', 'text-button', `data-id="${item.id}" aria-label="Modifier ${escape(item.label)}"`)}
        </div>
      </li>`).join('')}</ul>` : ''}
      ${button('new-favorite', '+ Ajouter un favori', 'secondary')}
    </section>
    <section class="card settings-card" aria-labelledby="backup-title">
      <h2 id="backup-title">Sauvegarde</h2>
      <p class="muted">Le journal est stocké sur cet appareil. Gardez une copie dans un endroit privé pour pouvoir le retrouver si vous changez de téléphone.</p>
      ${state.lastBackup ? `<p class="muted small">Dernier export le ${formatDate(state.lastBackup)}.</p>` : ''}
      <div class="settings-buttons">
        ${button('backup', 'Sauvegarder le journal', 'secondary')}
        ${button('restore', 'Restaurer une sauvegarde', 'text-button')}
        <input type="file" id="backup-file" accept=".json,application/json" hidden>
      </div>
    </section>
    <section class="card settings-card" aria-labelledby="install-title">
      <h2 id="install-title">Installation</h2>
      <p class="muted">Sur iPhone, ouvrez le journal dans Safari, puis utilisez Partager et choisissez Sur l’écran d’accueil. Sur Android, cherchez Installer l’application dans le menu du navigateur.</p>
    </section>`;
}

function render() {
  const current = view();
  const previous = document.activeElement;
  const action = previous?.dataset.action;
  const id = previous?.dataset.id;
  const pages = { journee: dayPage, historique: historyPage, rapport: reportPage, reglages: settingsPage };
  main.innerHTML = pages[current]();
  for (const link of document.querySelectorAll('.bottom a, .settings-link')) {
    if (link.hash.slice(1) === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (pendingFocus) {
    main.focus();
    pendingFocus = false;
  } else if (action && previous && !previous.isConnected) {
    const selector = `[data-action="${CSS.escape(action)}"]` + (id ? `[data-id="${CSS.escape(id)}"]` : '');
    main.querySelector(selector)?.focus({ preventScroll: true });
  }
}

function openDialog({ title, body, submit, action, danger = false }) {
  dialogAction = action;
  dialog.innerHTML = `<form><h2 id="dialog-title">${title}</h2>${body}
    <p id="dialog-error" class="error" role="alert" hidden></p>
    <div class="dialog-actions">
      ${button('close-dialog', 'Annuler', 'secondary')}
      <button class="${danger ? 'danger' : 'primary'}" type="submit">${submit}</button>
    </div></form>`;
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  dialog.showModal();
  dialog.querySelector('[autofocus]')?.focus();
}

function confirm(title, text, submit, action) {
  openDialog({ title, body: `<p>${text}</p>`, submit, action, danger: true });
}

function focusRow(id) {
  main.querySelector(`[data-action="increase"][data-id="${CSS.escape(id)}"]`)?.focus();
}

function addDialog(forDay, symptom) {
  const chosenDate = date;
  const list = state.symptoms.map(item => `<option value="${escape(item.label)}"></option>`).join('');
  openDialog({
    title: symptom ? 'Modifier le favori' : forDay ? 'Ajouter un symptôme' : 'Ajouter un favori',
    submit: symptom ? 'Enregistrer' : 'Ajouter',
    body: `<label>Nom du symptôme<input name="label" type="text" maxlength="${MAX_LABEL}" required autofocus
      ${symptom ? `value="${escape(symptom.label)}"` : 'list="known-symptoms"'} autocomplete="off"></label>
      ${!symptom && list ? `<datalist id="known-symptoms">${list}</datalist>` : ''}
      ${symptom || forDay ? `<label class="checkbox"><input type="checkbox" name="favorite" checked> Afficher dans les favoris</label>` : ''}`,
    action: async data => {
      const label = cleanLabel(data.get('label'));
      if (!label) throw new Error('Indiquez le nom du symptôme.');
      if (symptom && state.symptoms.some(item => item.id !== symptom.id && labelKey(item.label) === labelKey(label))) {
        throw new Error('Ce nom existe déjà.');
      }
      let selected;
      if (await mutate(current => {
        if (symptom) {
          const target = current.symptoms.find(item => item.id === symptom.id);
          if (!target) throw new Error('Ce symptôme n’existe plus.');
          if (current.symptoms.some(item => item.id !== symptom.id && labelKey(item.label) === labelKey(label))) throw new Error('Ce nom existe déjà.');
          target.label = label;
          target.favorite = data.has('favorite');
        } else {
          selected = addSymptom(current, label, !forDay || data.has('favorite')).id;
          if (forDay) addRow(current, chosenDate, selected);
        }
      })) {
        dialog.close();
        if (forDay) main.querySelector(`[data-row="${CSS.escape(selected)}"] strong`)?.scrollIntoView({ block: 'nearest' });
      }
    },
  });
}

function setDate(value, fromHistory = false) {
  if (!validDate(value) || value > today()) {
    say('Choisissez une date passée ou aujourd’hui.');
    render();
    return;
  }
  date = value;
  if (fromHistory) {
    location.hash = 'journee';
    return;
  }
  render();
}

function stepCount(id, delta) {
  const chosenDate = date;
  return mutate(current => {
    const rows = draftRows(current, chosenDate);
    const row = rows.find(item => item.id === id);
    if (!row) return;
    const count = Math.min(MAX_COUNT, Math.max(1, row.count + delta));
    if (count !== row.count) setDraft(current, chosenDate, rows.map(item => item.id === id ? { ...item, count } : item));
  });
}

function download(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function backup() {
  await queue;
  const file = new File([JSON.stringify(makeBackup(state), null, 2)],
    `sauvegarde-ressenti-${today()}.json`, { type: 'application/json' });
  download(file);
  await mutate(current => { current.lastBackup = today(); }, { message: 'Export de la sauvegarde lancé.' });
}

async function pdf(trigger) {
  if (trigger.disabled) return;
  trigger.disabled = true;
  trigger.textContent = 'Préparation du PDF…';
  try {
    await queue;
    const { createReportPdf } = await import('./pdf.js');
    if (!trigger.isConnected || view() !== 'rapport') return;
    const file = await createReportPdf(reportFor(state, range.start, range.end));
    if (!trigger.isConnected || view() !== 'rapport') return;
    openDialog({
      title: 'Rapport prêt',
      body: `<p>Votre rapport est prêt à être téléchargé.</p>
        ${navigator.canShare?.({ files: [file] }) ? button('share-pdf', 'Partager le PDF', 'secondary', 'id="share-pdf"') : ''}`,
      submit: 'Télécharger',
      action: () => { download(file); dialog.close(); },
    });
    dialog.querySelector('#share-pdf')?.addEventListener('click', async () => {
      try {
        await navigator.share({ files: [file], title: 'Ressenti' });
        dialog.close();
      } catch (error) {
        if (error.name !== 'AbortError') say('Partage indisponible. Vous pouvez télécharger le PDF.');
      }
    });
  } catch {
    say('Le PDF n’a pas pu être généré. Réessayez.');
  } finally {
    trigger.disabled = false;
    trigger.textContent = 'Exporter le PDF';
  }
}

async function selectBackup(file) {
  if (!file) return;
  try {
    const chosenBackup = readBackup(await file.text());
    const importedDays = Object.keys(chosenBackup.days).length;
    const existing = Object.keys(state.days).length || state.symptoms.length;
    confirm('Restaurer la sauvegarde',
      `Ce fichier contient ${plural(importedDays, 'journée')}. ${existing ? 'La restauration remplacera le journal et les favoris actuels. Annulez si vous souhaitez d’abord en garder une copie.' : 'Il sera importé sur cet appareil.'}`,
      'Restaurer', async () => {
        const incoming = chosenBackup;
        if (await mutate(current => {
          current.days = incoming.days;
          current.symptoms = incoming.symptoms;
          current.lastBackup = null;
        }, { message: 'Sauvegarde restaurée.' })) dialog.close();
      });
  } catch (error) {
    say(error.message || 'Impossible de lire cette sauvegarde.');
  }
}

function moveFavorite(id, delta) {
  return mutate(current => {
    const list = orderedSymptoms(current);
    const index = list.findIndex(item => item.id === id);
    const target = index < 0 ? undefined : list[index + delta];
    if (!target) return;
    const sourceIndex = current.symptoms.indexOf(list[index]);
    const targetIndex = current.symptoms.indexOf(target);
    [current.symptoms[sourceIndex], current.symptoms[targetIndex]] = [current.symptoms[targetIndex], current.symptoms[sourceIndex]];
  });
}

function commitWithConfirmation(title, text, label, update, success) {
  confirm(title, text, label, async () => {
    if (await mutate(update, { message: success })) dialog.close();
  });
}

main.addEventListener('click', event => {
  if (!state) {
    if (event.target.closest('[data-action="retry"]')) initialize();
    return;
  }
  const trigger = event.target.closest('button[data-action]');
  if (!trigger) return;
  const { action, id, date: clickedDate } = trigger.dataset;
  const chosenDate = date;
  switch (action) {
    case 'choose-today': setDate(today()); break;
    case 'choose-yesterday': setDate(addDays(today(), -1)); break;
    case 'new-entry': addDialog(true); break;
    case 'new-favorite': addDialog(false); break;
    case 'rename': addDialog(false, state.symptoms.find(item => item.id === id)); break;
    case 'quick-add':
      if (draftRows(state, chosenDate).some(row => row.id === id)) focusRow(id);
      else mutate(current => addRow(current, chosenDate, id));
      break;
    case 'decrease':
    case 'increase':
      stepCount(id, action === 'increase' ? 1 : -1);
      break;
    case 'remove-row':
      mutate(current => setDraft(current, chosenDate, draftRows(current, chosenDate).filter(row => row.id !== id)));
      break;
    case 'save-day':
      mutate(current => saveDay(current, chosenDate, 'symptoms'), { message: 'Journée enregistrée.' });
      break;
    case 'no-symptoms': {
      const update = current => saveDay(current, chosenDate, 'none');
      if (draftRows(state, chosenDate).length || state.days[chosenDate]?.saved?.status === 'symptoms') {
        commitWithConfirmation('Marquer « rien à signaler » ?', 'Les symptômes encodés pour cette journée seront retirés.',
          'Confirmer', update, 'Journée enregistrée.');
      } else mutate(update, { message: 'Journée enregistrée.' });
      break;
    }
    case 'discard-draft':
      commitWithConfirmation('Annuler le brouillon ?', 'Les changements en cours seront effacés.', 'Annuler le brouillon',
        current => discardDraft(current, chosenDate), 'Brouillon annulé.');
      break;
    case 'unrecord-day':
      commitWithConfirmation('Effacer cette journée ?', 'Elle apparaîtra comme non renseignée dans le journal.', 'Effacer la journée',
        current => { delete current.days[chosenDate]; }, 'Journée effacée.');
      break;
    case 'open-day': setDate(clickedDate, true); break;
    case 'previous-month':
    case 'next-month':
      historyMonth = shiftMonth(historyMonth, action === 'previous-month' ? -1 : 1);
      render();
      break;
    case 'last-month':
      range = { start: addDays(today(), -29), end: today() };
      render();
      break;
    case 'all-time':
      range = { start: Object.keys(state.days).filter(key => key <= today()).sort()[0] ?? today(), end: today() };
      render();
      break;
    case 'pdf': pdf(trigger); break;
    case 'backup': backup(); break;
    case 'restore': document.querySelector('#backup-file').click(); break;
    case 'favorite-up': moveFavorite(id, -1); break;
    case 'favorite-down': moveFavorite(id, 1); break;
  }
});

main.addEventListener('input', event => {
  const field = event.target;
  const id = field.dataset.note;
  if (!id) return;
  const chosenDate = date;
  const note = field.value;
  mutate(current => setDraft(current, chosenDate,
    draftRows(current, chosenDate).map(row => row.id === id ? { ...row, note } : row)), { render: false });
  markDraft();
});

main.addEventListener('change', event => {
  const field = event.target;
  if (field.id === 'day-date') setDate(field.value);
  if (field.id === 'report-start' || field.id === 'report-end') {
    range[field.id === 'report-start' ? 'start' : 'end'] = field.value;
    render();
    document.getElementById(field.id)?.focus({ preventScroll: true });
  }
  if (field.id === 'backup-file') {
    selectBackup(field.files[0]);
    field.value = '';
  }
  const id = field.dataset.count;
  if (!id) return;
  const chosenDate = date;
  const row = draftRows(state, chosenDate).find(item => item.id === id);
  const value = field.value.trim();
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > MAX_COUNT) {
    field.value = row?.count ?? 1;
    say(`Indiquez un nombre entier de 1 à ${MAX_COUNT}.`);
    return;
  }
  field.value = String(Number(value));
  mutate(current => setDraft(current, chosenDate, draftRows(current, chosenDate)
    .map(item => item.id === id ? { ...item, count: Number(value) } : item)), { render: false })
    .then(saved => {
      if (view() !== 'journee' || date !== chosenDate || !field.isConnected) return;
      if (!saved) {
        field.value = String(draftRows(state, chosenDate).find(item => item.id === id)?.count ?? 1);
        return;
      }
      const group = field.closest('.stepper');
      group.querySelector('[data-action="decrease"]').setAttribute('aria-disabled', String(Number(value) <= 1));
      group.querySelector('[data-action="increase"]').setAttribute('aria-disabled', String(Number(value) >= MAX_COUNT));
      markDraft();
    });
});

function markDraft() {
  const badge = main.querySelector('.day-heading .status');
  if (badge?.classList.contains('draft') === false) badge.outerHTML = statusLabel({ kind: 'draft', label: 'Brouillon' });
  const actions = main.querySelector('.save-actions');
  if (actions && !actions.querySelector('[data-action="discard-draft"]')) {
    actions.querySelector('[data-action="unrecord-day"]')?.remove();
    actions.insertAdjacentHTML('beforeend', button('discard-draft', 'Annuler le brouillon', 'text-button subdued'));
  }
}

main.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.matches('[data-count]')) event.target.blur();
});

dialog.addEventListener('click', event => {
  if (event.target.closest('[data-action="close-dialog"]')) dialog.close();
});
dialog.addEventListener('submit', async event => {
  event.preventDefault();
  const submitter = event.submitter ?? dialog.querySelector('[type="submit"]');
  if (submitter.disabled) return;
  const errorMessage = dialog.querySelector('#dialog-error');
  errorMessage.hidden = true;
  submitter.disabled = true;
  try {
    await dialogAction(new FormData(event.target));
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  } finally {
    submitter.disabled = false;
  }
});

window.addEventListener('hashchange', () => {
  if (view() === 'historique') historyMonth = date.slice(0, 7);
  if (dialog.open) dialog.close();
  pendingFocus = true;
  if (state) render();
});
channel?.addEventListener('message', () => {
  queue = queue.then(async () => {
    state = await loadJournal();
    if (!(main.contains(document.activeElement) && document.activeElement.matches('input, textarea'))) render();
  }).catch(() => say('Impossible d’actualiser le journal.'));
});

async function initialize() {
  try {
    state = await loadJournal();
    render();
  } catch {
    main.innerHTML = `${heading('Journal indisponible')}<p>Le stockage du navigateur est inaccessible.</p>${button('retry', 'Réessayer', 'primary')}`;
  }
}

document.addEventListener('visibilitychange', async () => {
  if (document.hidden || dialog.open || !state || today() === lastCalendarDay) return;
  await queue;
  const previous = lastCalendarDay;
  lastCalendarDay = today();
  if (date === previous && state.days[date]?.draft === undefined) date = lastCalendarDay;
  if (range.end === previous && range.start === addDays(previous, -29)) {
    range = { start: addDays(lastCalendarDay, -29), end: lastCalendarDay };
  }
  render();
});

initialize();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => say('Le mode hors ligne n’a pas pu être préparé.'));
}
