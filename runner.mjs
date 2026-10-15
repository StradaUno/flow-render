// Runner der Meme Fabrik: holt Aufträge, führt sie aus, meldet Ergebnisse.
// Gibt bewusst keine Inhalte (Texte, Namen) aus – die Logs dieses öffentlichen Repos zeigen nur IDs.
import puppeteer from 'puppeteer-core';
import { kiAusfuehren } from './ki.mjs';
import { reelBauen } from './render.mjs';

const URL = process.env.FLOW_FABRIK_URL;
const SCHLUESSEL = process.env.FLOW_RUNNER_SCHLUESSEL;
const PARALLEL = Number(process.env.FLOW_PARALLEL ?? 4);
const MAX_LAUFZEIT = 30 * 60 * 1000;
const LEER_WARTEN = 5000;
// Vorgewärmt (noch nichts zu tun): bis zu 6 Minuten bereit bleiben; nach getaner Arbeit: 60 s auf weitere Aufträge warten
const LEER_RUNDEN_START = 72, LEER_RUNDEN = 12;
let schonGearbeitet = false;

if (!URL || !SCHLUESSEL) { console.error('FLOW_FABRIK_URL / FLOW_RUNNER_SCHLUESSEL fehlen'); process.exit(1); }

async function api(body) {
  for (let v = 1; v <= 3; v++) {
    try {
      const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-flow-runner': SCHLUESSEL }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.fehler ?? `HTTP ${r.status}`);
      return j;
    } catch (e) {
      if (v === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * v));
    }
  }
}

const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
const start = Date.now();
let browser;

async function arbeiter(nr) {
  let leer = 0;
  while (Date.now() - start < MAX_LAUFZEIT) {
    const { auftrag } = await api({ aktion: 'runner_naechster' });
    if (!auftrag) {
      if (++leer >= (schonGearbeitet ? LEER_RUNDEN : LEER_RUNDEN_START)) return;
      await schlaf(LEER_WARTEN);
      continue;
    }
    leer = 0;
    schonGearbeitet = true;
    if (auftrag.art === 'uebersprungen') continue;
    const t0 = Date.now();
    try {
      if (auftrag.art === 'ki') {
        const e = await kiAusfuehren(auftrag.ki);
        await api({ aktion: 'runner_ergebnis', id: auftrag.id, ok: true, daten: e.daten, nutzung: e.nutzung });
      } else if (auftrag.art === 'render') {
        browser ??= await puppeteer.launch({ executablePath: process.env.CHROME_PFAD ?? '/usr/bin/google-chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
        const d = await reelBauen(browser, auftrag.render);
        await api({ aktion: 'runner_ergebnis', id: auftrag.id, ok: true, daten: d });
      }
      console.log(`[${nr}] ${auftrag.art} ${auftrag.id.slice(0, 8)} ok (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (e) {
      console.log(`[${nr}] ${auftrag.art} ${auftrag.id.slice(0, 8)} Fehler`);
      await api({ aktion: 'runner_ergebnis', id: auftrag.id, ok: false, fehler: String(e?.message ?? e).slice(0, 500) }).catch(() => {});
    }
  }
}

try {
  await Promise.all(Array.from({ length: PARALLEL }, (_, i) => arbeiter(i + 1)));
} finally {
  await browser?.close().catch(() => {});
  await api({ aktion: 'runner_ende' }).catch(() => {});
  console.log(`Fertig nach ${((Date.now() - start) / 1000).toFixed(0)} s`);
}
