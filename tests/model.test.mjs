import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDays, addRow, addSymptom, discardDraft, draftRows, emptyState, makeBackup, readBackup,
  reportFor, saveDay, setDraft, shiftMonth, today, validDate,
} from '../docs/model.js';

function makeJournal() {
  const state = emptyState();
  const symptom = addSymptom(state, 'Étourdissement', true);
  setDraft(state, '2026-11-15', [{ id: symptom.id, count: 3, note: 'Deux fois le matin.' }]);
  saveDay(state, '2026-11-15', 'symptoms');
  saveDay(state, '2026-11-16', 'none');
  setDraft(state, '2026-11-18', [{ id: symptom.id, count: 5, note: '' }]);
  saveDay(state, '2026-11-18', 'symptoms');
  addRow(state, '2026-11-19', symptom.id);
  setDraft(state, '2026-11-18', [{ id: symptom.id, count: 2, note: 'Brouillon' }]);
  return { state, symptom };
}

test('uses calendar dates across month, leap day and year boundaries', () => {
  assert.equal(today(new Date(2026, 10, 20, 0, 1)), '2026-11-20');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2026-11-32'), false);
});

test('counts occurrences and distinct days without including unvalidated edits', () => {
  const { state } = makeJournal();
  const result = reportFor(state, '2026-11-15', '2026-11-20');
  assert.deepEqual(result.coverage, { symptoms: 2, none: 1, missing: 2, draft: 1 });
  assert.deepEqual(result.summary, [{ label: 'Étourdissement', count: 8, days: 2 }]);
  assert.deepEqual(result.details.map(day => day.date), ['2026-11-15', '2026-11-18']);
  assert.equal(result.details[0].rows[0].note, 'Deux fois le matin.');
  assert.equal(result.details[1].rows[0].note, '');
});

test('counts inclusive ranges over a daylight-saving change', () => {
  const state = emptyState();
  assert.equal(reportFor(state, '2026-10-24', '2026-10-26').coverage.missing, 3);
  assert.throws(() => reportFor(state, '2026-11-20', '2026-11-19'), /période valide/);
});

test('uses one row per symptom and date and retains user labels', () => {
  const state = emptyState();
  const one = addSymptom(state, '  Déjà   vu ', false);
  const two = addSymptom(state, 'déjà vu', true);
  assert.equal(one, two);
  assert.equal(two.label, 'Déjà vu');
  assert.equal(two.favorite, true);
  addRow(state, '2026-11-20', one.id);
  addRow(state, '2026-11-20', two.id);
  assert.equal(draftRows(state, '2026-11-20').length, 1);
  assert.throws(() => addRow(state, '2026-11-20', 'missing'), /n’existe plus/);
});

test('discards a new day or returns to the last saved version', () => {
  const { state } = makeJournal();
  discardDraft(state, '2026-11-19');
  discardDraft(state, '2026-11-18');
  assert.equal(state.days['2026-11-19'], undefined);
  assert.equal(state.days['2026-11-18'].draft, undefined);
  assert.equal(draftRows(state, '2026-11-18')[0].count, 5);
});

test('exports and restores draft and saved data losslessly', () => {
  const { state } = makeJournal();
  const exported = makeBackup(state, new Date('2026-11-20T18:00:00Z'));
  assert.deepEqual(readBackup(JSON.stringify(exported)), state);
});

test('rejects incompatible, malformed or inconsistent backup data', () => {
  const { state } = makeJournal();
  assert.throws(() => readBackup('<html>'), /lisible/);
  assert.throws(() => readBackup(JSON.stringify({ ...makeBackup(state), version: 2 })), /incompatible/);
  const attempt = (date, edit) => {
    const file = structuredClone(makeBackup(state));
    edit(file.days[date]);
    assert.throws(() => readBackup(JSON.stringify(file)), /endommagée/);
  };
  attempt('2026-11-15', day => { day.saved.rows[0].count = 0; });
  attempt('2026-11-15', day => { day.saved.rows[0].id = 'unrecognized'; });
  attempt('2026-11-15', day => { day.saved.rows.push(day.saved.rows[0]); });
  attempt('2026-11-16', day => { day.saved.status = 'symptoms'; });
});