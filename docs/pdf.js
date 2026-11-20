import { formatDate, coverageItems } from './model.js';

let library;

async function pdfEngine() {
  if (!library) {
    library = Promise.all([
      new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('./vendor/jspdf.umd.min.js', import.meta.url);
        script.onload = () => resolve(window.jspdf.jsPDF);
        script.onerror = () => { script.remove(); reject(new Error('Générateur PDF inaccessible.')); };
        document.head.append(script);
      }),
      fetch(new URL('./vendor/noto-sans.ttf', import.meta.url)).then(async response => {
        if (!response.ok) throw new Error('Police PDF inaccessible.');
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary);
      }),
    ]).catch(error => {
      library = undefined;
      throw error;
    });
  }
  return library;
}

const accent = '#254e3d';
const ink = '#252a26';
const muted = '#4d5850';
const left = 19;
const right = 191;
const lineHeight = 5.2;
const lastLine = 271;

export async function createReportPdf(report) {
  const [JsPDF, font] = await pdfEngine();
  const pdf = new JsPDF({ compress: true, putOnlyUsedFonts: true });
  pdf.addFileToVFS('JournalSans.ttf', font);
  pdf.addFont('JournalSans.ttf', 'JournalSans', 'normal');
  pdf.setFont('JournalSans');
  pdf.setProperties({ title: 'Ressenti', subject: 'Relevé personnel des symptômes' });
  let y = 18;

  function write(text, x = left, { size = 10.5, color = ink, align = 'left' } = {}) {
    pdf.setFontSize(size);
    pdf.setTextColor(color);
    pdf.text(String(text), x, y, { align });
  }

  function rule() {
    pdf.setDrawColor('#dee5de');
    pdf.line(left, y, right, y);
    y += 8;
  }

  function space(required) {
    if (y + required <= lastLine) return;
    pdf.addPage();
    y = 18;
    write('Ressenti', left, { size: 10, color: accent });
    y += 4;
    rule();
  }

  function paragraph(text, x = left, size = 10.5, color = ink) {
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text.normalize('NFC').replace(/\t/g, '    '), right - x);
    for (const line of lines) {
      space(lineHeight);
      write(line, x, { size, color });
      y += lineHeight;
    }
  }

  function section(title) {
    space(16);
    write(title, left, { size: 15, color: accent });
    y += 8;
  }

  const countLabel = (n, unit) => n + ' ' + unit + (n === 1 ? '' : 's');

  write('Ressenti', left, { size: 26, color: accent });
  y += 8;
  paragraph('Relevé personnel des symptômes', left, 11, muted);
  y += 2;
  paragraph(`Du ${formatDate(report.start)} au ${formatDate(report.end)}`);
  y += 3;
  rule();

  section('Journées sur la période');
  for (const item of coverageItems(report.coverage)) {
    write(item.label);
    write(item.count, right, { align: 'right' });
    y += lineHeight;
  }
  y += 6;
  section('Par symptôme');
  if (!report.summary.length) paragraph('Aucun symptôme enregistré sur cette période.', left, 10.5, muted);
  for (const item of report.summary) {
    space(11);
    paragraph(item.label);
    paragraph(`${countLabel(item.count, 'occurrence')} sur ${countLabel(item.days, 'jour')}`, left + 3, 10, muted);
    y += 2;
  }

  if (report.details.length) {
    y += 6;
    section('Détail par jour');
    for (const day of report.details) {
      space(16);
      write(formatDate(day.date, true), left, { size: 12, color: accent });
      y += 6;
      for (const row of day.rows) {
        space(row.note ? 11 : 5.2);
        paragraph(`${row.label} · ${row.count} fois`);
        if (row.note) paragraph(row.note, left + 3, 10, muted);
      }
      y += 5;
    }
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    y = 280;
    pdf.setDrawColor('#dee5de');
    pdf.line(left, y, right, y);
    y += 5;
    write('Relevé personnel', left, { size: 9, color: muted });
    write(`${page} / ${pages}`, right, { size: 9, color: muted, align: 'right' });
  }
  return new File([pdf.output('blob')], `ressenti-${report.start}-${report.end}.pdf`, { type: 'application/pdf' });
}