// Textflächen als transparente PNGs (1080×1920) im Aufbau wie Pupazzomio (render/layout.mjs) – gleich wie die Live-Vorschau der App.
// t1.png = nur Szene, t2.png = Szene + Pointe (gleiche Schriftgröße und Oberkante). Unter der Figur klein @pazziflow und @Account.
import { readFile } from 'node:fs/promises';
import { AUFBAU, B, H } from './layout.mjs';

const FONTS = 'https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Nunito:wght@600;800&family=Inter:wght@500;700&family=Fredoka:wght@500;600&family=Anton&display=block';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function seite(fontFamilie) {
  return `<!doctype html><html><head><meta charset="utf-8"><link href="${FONTS}" rel="stylesheet">
<style>html,body{margin:0;width:${B}px;height:${H}px;background:transparent;overflow:hidden}
.box{position:absolute;left:50%;transform:translateX(-50%);box-sizing:border-box;text-align:center;white-space:pre;font-family:'${fontFamilie}',sans-serif}
.handle{position:absolute;left:0;right:0;text-align:center;font-family:'Poppins',sans-serif;font-weight:500}</style>
</head><body><span style="font-family:'${fontFamilie}';font-weight:500">.</span><span style="font-family:'${fontFamilie}';font-weight:700">.</span><span style="font-family:'${fontFamilie}';font-weight:800">.</span></body></html>`;
}

/** a: { text1, text2, stil, schrift: {familie, kurz, lang}, handle? } → { t1, t2 } (Dateipfade) */
export async function textflaechenBauen(browser, a, dir) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: B, height: H, deviceScaleFactor: 1 });
    await page.setContent(seite(a.schrift.familie), { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    // Layout-Code in die Seite laden und dort mit echter Schrift messen
    const code = (await readFile(new URL('./layout.mjs', import.meta.url), 'utf8')).replace(/^export /gm, '');
    await page.addScriptTag({ content: `${code}\nwindow.textAufbau = textAufbau;` });
    const lay = await page.evaluate((t1, t2, schrift) => {
      const c = document.createElement('canvas').getContext('2d');
      const messen = (text, px, gewicht) => { c.font = `${gewicht} ${px}px '${schrift.familie}', sans-serif`; return c.measureText(text).width; };
      return window.textAufbau(t1, t2, schrift, messen);
    }, a.text1, a.text2 ?? '', a.schrift);

    const s = a.stil;
    const ohneFlaeche = s.box === 'transparent' || !!s.schatten;
    const schatten = ohneFlaeche ? `text-shadow:0 2px 14px ${s.schatten ?? 'rgba(0,0,0,.45)'};` : '';
    const box = ohneFlaeche ? 'padding:0' : `background:${s.box};padding:28px 36px;border-radius:24px;${s.rand ? `border:3px solid ${s.rand};` : ''}box-shadow:0 6px 22px rgba(0,0,0,.14)`;
    const zeichnen = async (zeilen, ziel) => {
      await page.evaluate((html) => { document.body.innerHTML = html; }, `<div class="box" style="top:${lay.top}px;font-size:${lay.px}px;line-height:${lay.zeile};font-weight:${lay.gewicht};color:${s.fg};${schatten}${box}">${esc(zeilen.join('\n'))}</div>`
        + (a.marke === false && !a.handle ? '' : `<div class="handle" style="top:${AUFBAU.handle.y * H}px;font-size:${AUFBAU.handle.px}px;line-height:${AUFBAU.handle.zeile};color:${AUFBAU.handle.farbe};opacity:${AUFBAU.handle.deckkraft};white-space:pre">${esc([a.marke !== false ? '@' + AUFBAU.handle.marke : '', a.handle ? '@' + a.handle : ''].filter(Boolean).join('\n'))}</div>`));
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: ziel, omitBackground: true, type: 'png' });
    };
    const t1 = `${dir}/t1.png`, t2 = `${dir}/t2.png`;
    await zeichnen(lay.zeilen1, t1);
    if ((a.text2 ?? '').trim()) await zeichnen(lay.zeilen, t2);
    return { t1, t2: (a.text2 ?? '').trim() ? t2 : null };
  } finally {
    await page.close();
  }
}
