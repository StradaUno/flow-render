// Textaufbau wie Pupazzomio – gleiche Regeln im Renderer (render/textflaeche.mjs) und in der App (app/src/layout.ts).
// Alle Maße in px bei 1080 × 1920; messen(text, px, gewicht) liefert die Breite einer Zeile.
//  kurz (< 18 Wörter): fett, Start 66 px, in 2er-Schritten kleiner bis die längste Zeile in 74 % passt (min. 40 px),
//                      Zeilen aus dem Spruch (\n), zu lange Zeilen zwischen Wörtern umbrechen (max. 5 Zeilen),
//                      Text mittig zwischen 13 % und 40 % der Höhe.
//  lang (ab 18 Wörtern): mittel, Start 50 px (min. 34 px), Umbruch auf 80 % der Breite, Absätze bleiben, Text oben ab 8 %.
// Szene → Pointe: Größe und Lage richten sich nach dem vollen Text, die Szene allein steht an derselben Stelle.

export const B = 1080, H = 1920;
export const AUFBAU = {
  grenzeWoerter: 18,
  kurz: { start: 66, min: 40, schritt: 2, breite: 0.74, oben: 0.13, unten: 0.40, zeile: 1.22, maxZeilen: 5 },
  lang: { start: 50, min: 34, schritt: 2, breite: 0.80, oben: 0.08, unten: 0.44, zeile: 1.32 },
  handle: { px: 40, y: 0.885, farbe: '#8A735F' },
};

const woerter = (t) => String(t ?? '').trim().split(/\s+/).filter(Boolean).length;

/** Wörter einer Zeile auf maxBreite umbrechen */
function umbrechen(zeile, px, gewicht, maxBreite, messen) {
  const w = zeile.split(/\s+/).filter(Boolean);
  if (!w.length) return [''];
  const aus = [];
  let akt = w[0];
  for (const x of w.slice(1)) {
    if (messen(`${akt} ${x}`, px, gewicht) <= maxBreite) akt = `${akt} ${x}`;
    else { aus.push(akt); akt = x; }
  }
  aus.push(akt);
  return aus;
}

/**
 * @returns {{ px: number, gewicht: number, zeile: number, top: number, zeilen1: string[], zeilen: string[], art: 'kurz'|'lang' }}
 * zeilen1 = nur Szene, zeilen = Szene + Leerzeile + Pointe (gleiche Größe, gleiche Oberkante)
 */
export function textAufbau(text1, text2, schrift, messen) {
  const t1 = String(text1 ?? '').replace(/\\n/g, '\n').trim();
  const t2 = String(text2 ?? '').replace(/\\n/g, '\n').trim();
  const n = woerter(t1) + woerter(t2);
  const kurz = n < AUFBAU.grenzeWoerter;
  const A = kurz ? AUFBAU.kurz : AUFBAU.lang;
  const gewicht = kurz ? schrift.kurz : schrift.lang;
  const maxB = A.breite * B;
  const absaetze = (t) => t.split('\n');
  const bauen = (px) => {
    const z1 = absaetze(t1).flatMap((z) => (kurz && messen(z, px, gewicht) <= maxB) ? [z] : umbrechen(z, px, gewicht, maxB, messen));
    const z2 = t2 ? absaetze(t2).flatMap((z) => (kurz && messen(z, px, gewicht) <= maxB) ? [z] : umbrechen(z, px, gewicht, maxB, messen)) : [];
    return { z1, alle: t2 ? [...z1, '', ...z2] : z1 };
  };
  const raum = (A.unten - A.oben) * H;
  let px = A.start, z = bauen(px);
  for (;;) {
    const breiteste = Math.max(...z.alle.map((x) => messen(x, px, gewicht)));
    const hoehe = z.alle.length * px * A.zeile;
    const zuViel = kurz ? (breiteste > maxB || z.alle.filter(Boolean).length > A.maxZeilen || hoehe > raum) : hoehe > raum;
    if (!zuViel || px <= A.min) break;
    px = Math.max(A.min, px - A.schritt);
    z = bauen(px);
  }
  const hoehe = z.alle.length * px * A.zeile;
  const top = kurz ? Math.max(A.oben * H, ((A.oben + A.unten) / 2) * H - hoehe / 2) : A.oben * H;
  return { px, gewicht, zeile: A.zeile, top, zeilen1: z.z1, zeilen: z.alle, art: kurz ? 'kurz' : 'lang' };
}
