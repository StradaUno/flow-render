// Textfläche als transparentes PNG (1080×1920) – gleiche Gestaltung wie die Live-Vorschau der App.
// Maße in Prozent der Breite, damit Vorschau (klein) und Reel (groß) identisch aussehen.

export const MASSE = { schrift: 5.74, zeile: 1.22, padY: 2.6, padX: 3.3, radius: 2.2, maxBreite: 88, rand: 0.28 };

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function textflaecheHtml({ text, stil, texthoehe, breite = 1080, hoehe = 1920 }) {
  const px = (p) => (p * breite) / 100;
  const rand = stil.rand ? `${px(MASSE.rand)}px solid ${stil.rand}` : 'none';
  // Stil ohne Fläche: weicher Schatten statt Box
  const ohneFlaeche = stil.box === 'transparent' || !!stil.schatten;
  const schatten = ohneFlaeche
    ? `text-shadow:0 ${px(0.3)}px ${px(1.6)}px ${stil.schatten ?? 'rgba(0,0,0,.55)'},0 0 ${px(0.6)}px ${stil.schatten ?? 'rgba(0,0,0,.55)'};box-shadow:none;`
    : `box-shadow:0 ${px(0.5)}px ${px(2)}px rgba(0,0,0,.14);`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700&display=block" rel="stylesheet">
<style>
html,body{margin:0;width:${breite}px;height:${hoehe}px;background:transparent;overflow:hidden}
.box{position:absolute;left:50%;transform:translateX(-50%);top:${(texthoehe * 100).toFixed(2)}%;
  max-width:${MASSE.maxBreite}%;width:max-content;box-sizing:border-box;
  background:${ohneFlaeche ? 'transparent' : stil.box};color:${stil.fg};border:${rand};border-radius:${px(MASSE.radius)}px;
  padding:${px(MASSE.padY)}px ${px(MASSE.padX)}px;font-family:Inter,sans-serif;font-weight:700;
  font-size:${px(MASSE.schrift)}px;line-height:${MASSE.zeile};text-align:center;letter-spacing:-0.01em;
  ${schatten}overflow-wrap:break-word}
</style></head><body><div class="box">${esc(text)}</div></body></html>`;
}

export async function textflaechePng(browser, opts, ziel) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: opts.breite ?? 1080, height: opts.hoehe ?? 1920, deviceScaleFactor: 1 });
    await page.setContent(textflaecheHtml(opts), { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: ziel, omitBackground: true, type: 'png' });
  } finally {
    await page.close();
  }
}
