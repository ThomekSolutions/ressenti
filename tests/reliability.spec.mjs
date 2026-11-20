import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';
import { addDays, today } from '../docs/model.js';

const ready = page => expect(page.getByRole('heading', { name: 'Symptômes', exact: true })).toBeVisible();

test('preserves the journal when a newer offline cache takes over', async ({ context }, info) => {
  let updated = false;
  let updateRequests = 0;
  const base = new URL(info.project.use.baseURL);
  const proxy = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, base.origin);
      const upstream = await fetch(url);
      let data = Buffer.from(await upstream.arrayBuffer());
      if (updated && url.pathname.endsWith('/sw.js')) {
        updateRequests++;
        data = Buffer.from(data.toString('utf8').replace(/cachePrefix \+ '[0-9a-f]+'/, "cachePrefix + 'version-test'"));
      }
      response.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'text/plain',
        'Cache-Control': 'no-store',
      });
      response.end(data);
    } catch {
      response.writeHead(502).end();
    }
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${proxy.address().port}${base.pathname}`;
  try {
    let page = await context.newPage();
    await page.goto(url);
    await ready(page);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.getByRole('button', { name: 'Rien à signaler', exact: true }).click();
    await expect(page.getByText('Cette journée est enregistrée sans symptôme.')).toBeVisible();

    updated = true;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    });
    expect(updateRequests).toBeGreaterThan(0);
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);
    await page.close();

    page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const cacheName = (await caches.keys()).find(name => name.endsWith(':version-test'));
      return !!cacheName && registration?.active?.state === 'activated'
        && registration.active === navigator.serviceWorker.controller
        && !!(await caches.match(new URL('./index.html', location.href), { cacheName }));
    });
    await expect(page.getByText('Cette journée est enregistrée sans symptôme.')).toBeVisible();
    await page.close();
  } finally {
    await new Promise(resolve => {
      proxy.close(resolve);
      proxy.closeAllConnections();
    });
  }
});

test('exports a long report with notes and multiple pages', async ({ page }, info) => {
  const end = today();
  const start = addDays(end, -24);
  const symptom = { id: 'fixture', label: 'Étourdissement à l’œil gauche', favorite: true };
  const days = {};
  for (let offset = 0; offset <= 24; offset++) {
    const note = 'Détail observé au réveil, puis le soir après le dîner. '.repeat(6) + `Fin de la note ${offset + 1}.`;
    const rows = [{ id: symptom.id, count: 2, note }];
    days[addDays(start, offset)] = { saved: { status: 'symptoms', rows } };
  }
  await page.goto('./');
  await ready(page);
  await page.getByRole('link', { name: 'Réglages' }).click();
  await page.locator('#backup-file').setInputFiles({
    name: 'synthetique.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      format: 'journal-epilepsie', version: 1, exportedAt: new Date().toISOString(), symptoms: [symptom], days,
    })),
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Restaurer', exact: true }).click();
  await expect(page.getByText('Sauvegarde restaurée.')).toBeVisible();
  await page.getByRole('link', { name: 'Rapport' }).click();
  await expect(page.getByText('50 occurrences sur 25 jours')).toBeVisible();
  await page.getByRole('button', { name: 'Exporter le PDF' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog').getByRole('button', { name: 'Télécharger' }).click(),
  ]);
  await download.saveAs(info.outputPath('rapport-long.pdf'));
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const pdf = Buffer.concat(chunks).toString('latin1');
  expect([...pdf.matchAll(/\/Type\s+\/Page\b/g)].length).toBeGreaterThan(3);
});