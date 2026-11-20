import { test, expect } from '@playwright/test';

async function start(page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Symptômes', exact: true })).toBeVisible();
}

async function add(page, label, favorite = true) {
  await page.getByRole('button', { name: /^(Ajouter un symptôme|Autre symptôme)$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nom du symptôme').fill(label);
  if (!favorite) await dialog.getByLabel('Afficher dans les favoris').uncheck();
  await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function validatedDay(page, label = 'Déjà vu', count = 3) {
  await add(page, label);
  await page.getByRole('textbox', { name: `Nombre de fois pour ${label}` }).fill(String(count));
  await page.getByRole('button', { name: 'Enregistrer la journée' }).click();
  await expect(page.getByText('Journée enregistrée.', { exact: true })).toBeVisible();
}

test('completes a day, uses a counter, resumes a draft, and corrects a day', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await expect(page.getByText('Non renseignée', { exact: true })).toBeVisible();
  await add(page, 'Déjà vu');
  await page.getByRole('button', { name: 'Augmenter le nombre pour Déjà vu' }).click({ clickCount: 2 });
  await expect(page.getByRole('textbox', { name: 'Nombre de fois pour Déjà vu' })).toHaveValue('3');
  await add(page, 'Étourdissement', false);
  await page.getByText('Ajouter une note', { exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Note pour Déjà vu' }).fill('Deux fois le matin, une fois le soir.');
  await expect(page.getByText('Brouillon', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Note pour Déjà vu' })).toHaveValue('Deux fois le matin, une fois le soir.');
  await page.screenshot({ path: info.outputPath('saisie-mobile.png') });
  await page.getByRole('button', { name: 'Enregistrer la journée' }).click();
  await expect(page.getByText('Avec symptômes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hier', exact: true }).click();
  await page.getByRole('button', { name: 'Rien à signaler', exact: true }).click();
  await expect(page.getByText('Cette journée est enregistrée sans symptôme.')).toBeVisible();
  await page.getByRole('link', { name: 'Historique' }).click();
  await page.getByRole('button', { name: /· Avec symptômes$/ }).click();
  await page.getByRole('textbox', { name: 'Nombre de fois pour Déjà vu' }).fill('5');
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await expect(page.getByText('Avec symptômes', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Rapport' }).click();
  await expect(page.getByText('5 occurrences sur 1 jour')).toBeVisible();
  await expect(page.getByText('Deux fois le matin, une fois le soir.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('edits and reorders favorites while retaining past totals', async ({ page }) => {
  await start(page);
  await validatedDay(page);
  await add(page, 'Étourdissement');
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await expect(page.getByText('Avec symptômes', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Réglages' }).click();
  await page.getByRole('button', { name: 'Monter Étourdissement' }).click();
  await expect(page.locator('.favorite-list strong').first()).toHaveText('Étourdissement');
  await page.getByRole('button', { name: 'Modifier Déjà vu' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nom du symptôme').fill('Déjà vu précisé');
  await dialog.getByLabel('Afficher dans les favoris').uncheck();
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.favorite-list strong')).toHaveCount(1);
  await page.getByRole('link', { name: 'Rapport' }).click();
  await expect(page.locator('#summary-title + ul').getByText('Déjà vu précisé', { exact: true })).toBeVisible();
  await expect(page.getByText('3 occurrences sur 1 jour')).toBeVisible();
});

test('downloads a backup, validates imports and restores into a fresh journal', async ({ page, browser }, info) => {
  await start(page);
  await validatedDay(page);
  await page.getByRole('link', { name: 'Réglages' }).click();
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Sauvegarder le journal' }).click(),
  ]);
  const path = info.outputPath('sauvegarde.json');
  await file.saveAs(path);
  await expect(page.getByText(/Dernier export/)).toBeVisible();

  const fresh = await browser.newContext({ ...info.project.use });
  try {
    const restored = await fresh.newPage();
    await start(restored);
    await restored.getByRole('link', { name: 'Réglages' }).click();
    await restored.locator('#backup-file').setInputFiles({
      name: 'incorrect.json', mimeType: 'application/json', buffer: Buffer.from('{}'),
    });
    await expect(restored.getByRole('status')).toHaveText('Ce fichier ne provient pas de ce journal.');
    await expect(restored.getByRole('dialog')).toBeHidden();
    await restored.locator('#backup-file').setInputFiles(path);
    const dialog = restored.getByRole('dialog');
    await expect(dialog.getByText(/contient 1 journée/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Restaurer', exact: true }).click();
    await expect(restored.getByText('Sauvegarde restaurée.')).toBeVisible();
    await restored.getByRole('link', { name: 'Rapport' }).click();
    await expect(restored.getByText('3 occurrences sur 1 jour')).toBeVisible();
    await restored.getByRole('link', { name: 'Réglages' }).click();
    await restored.locator('#backup-file').setInputFiles(path);
    await expect(dialog.getByText(/remplacera le journal/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await fresh.close();
  }
});

test('reopens from the GitHub Pages subpath and produces a PDF in airplane mode', async ({ page, context }, info) => {
  const remoteRequests = [];
  page.on('request', request => {
    if (request.url().startsWith('http') && !request.url().startsWith('http://127.0.0.1:4173/')) remoteRequests.push(request.url());
  });
  await start(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await validatedDay(page, 'Œil gauche', 13);
  await page.locator('summary').click();
  await page.getByRole('textbox', { name: 'Note pour Œil gauche' }).fill('Épisode après le déjeuner.\nRetour à la normale le soir.');
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await expect(page.getByText('Avec symptômes', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Rapport' }).click();
  await expect(page.getByText('13 occurrences sur 1 jour')).toBeVisible();
  await page.getByRole('button', { name: 'Exporter le PDF' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Rapport prêt' })).toBeVisible();
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Télécharger' }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/^ressenti-.+\.pdf$/);
  await file.saveAs(info.outputPath('rapport.pdf'));
  const readable = await file.createReadStream();
  const chunks = [];
  for await (const chunk of readable) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString('ascii', 0, 5)).toBe('%PDF-');
  expect(remoteRequests).toEqual([]);
});

test('keeps controls within a 320 px screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await start(page);
  await add(page, 'Symptôme avec un nom très long qui doit rester lisible sur le petit écran');
  for (const pageName of ['Journée', 'Historique', 'Rapport', 'Réglages']) {
    await page.getByRole('link', { name: pageName, exact: true }).click();
    await expect(page.getByRole('link', { name: pageName, exact: true })).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});