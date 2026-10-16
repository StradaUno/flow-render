// Google Vertex AI: Anmeldung mit Dienstkonto (GitHub-Secret FLOW_VERTEX_KEY), Bild erzeugen, Bild prüfen.
// Gibt keine Inhalte aus (öffentliches Repo).
import { createSign } from 'node:crypto';

let token = null;

export async function zugang() {
  if (token && token.bis > Date.now() + 60000) return token;
  const roh = process.env.FLOW_VERTEX_KEY;
  if (!roh) throw new Error('FLOW_VERTEX_KEY fehlt (Google-Zugang noch nicht eingerichtet)');
  const k = JSON.parse(roh);
  const jetzt = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const kopf = b64({ alg: 'RS256', typ: 'JWT' });
  const inhalt = b64({ iss: k.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: jetzt, exp: jetzt + 3600 });
  const sig = createSign('RSA-SHA256').update(`${kopf}.${inhalt}`).sign(k.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${kopf}.${inhalt}.${sig}` }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Google-Anmeldung: ${j.error_description ?? j.error ?? r.status}`);
  token = { wert: j.access_token, projekt: k.project_id, bis: Date.now() + j.expires_in * 1000 };
  return token;
}

const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));

async function aufruf(modell, ort, body) {
  const z = await zugang();
  const host = ort === 'global' ? 'aiplatform.googleapis.com' : `${ort}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${z.projekt}/locations/${ort}/publishers/google/models/${modell}:generateContent`;
  let letzte = '';
  for (let v = 0; v < 5; v++) {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${z.wert}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j;
    letzte = `Vertex HTTP ${r.status}: ${j.error?.message ?? ''}`.slice(0, 300);
    if (r.status !== 429 && r.status < 500) break;
    await schlaf(10000 * (v + 1)); // Google bremst: warten und erneut
  }
  throw new Error(letzte);
}

/** Bild als inlineData-Teil aus einer (signierten) URL */
export async function bildTeil(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Vorlage: HTTP ${r.status}`);
  const typ = r.headers.get('content-type')?.split(';')[0] || (/\.png(\?|$)/i.test(url) ? 'image/png' : /\.webp(\?|$)/i.test(url) ? 'image/webp' : 'image/jpeg');
  return { inlineData: { mimeType: typ, data: Buffer.from(await r.arrayBuffer()).toString('base64') } };
}

/** Neues Bild: Vorlagen (Hauptbild …) + Prompt → PNG-Buffer */
export async function bildErzeugen({ prompt, vorlagen, modell, ort = 'global', format = '9:16' }) {
  const teile = [...vorlagen, { text: prompt }];
  const j = await aufruf(modell, ort, {
    contents: [{ role: 'user', parts: teile }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: format } },
  });
  const teil = (j.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
  if (!teil) throw new Error('kein Bild in der Antwort (evtl. Inhaltsfilter)');
  return Buffer.from(teil.inlineData.data, 'base64');
}

/** Bildprüfung mit einem günstigen Modell: gleiche Figur? Schrift? abgeschnitten? oberes Drittel frei? Szene passt? */
export async function bildPruefen({ bild, vorlage, szene, modell, ort = 'global', modus = 'szene', einfarbig = false }) {
  const j = await aufruf(modell, ort, {
    contents: [{ role: 'user', parts: [
      { text: 'Bild 1 ist die Vorlage der Figur, Bild 2 das neue Bild.' }, vorlage,
      { inlineData: { mimeType: 'image/png', data: bild.toString('base64') } },
      { text: modus === 'figur'
        // Hauptbild/Figurenblatt: nur Figur und Schrift prüfen (Merkmal und Haltung ändern sich absichtlich)
        ? `Prüfe Bild 2. ok=false, wenn EINES zutrifft: (1) Es ist eine andere Figur als in Bild 1 (andere Tierart/Typ, anderes Gesicht oder ganz andere Farben). Neue Accessoires, Kleidung, Hintergrundfarbe oder Ausdruck sind gewollt und OK. (2) Im Bild steht Schrift, Buchstaben oder Zahlen. (3) Die Figur ist abgeschnitten oder hat grobe Körperfehler. ${szene ? `Hinweis zum Auftrag: ${szene}. ` : ''}Antworte nur als JSON mit ok und einem kurzen grund auf Deutsch.`
        : `Prüfe Bild 2 streng. ok=false, wenn EINES zutrifft: (1) Es ist nicht dieselbe Figur wie in Bild 1 (Tierart/Typ, Farben, Gesicht, Erkennungsmerkmal). (2) Im Bild steht Schrift, Buchstaben oder Zahlen. (3) Die Figur ist abgeschnitten oder hat Körperfehler. (4) Das obere Drittel ist nicht ruhig und frei. (5) Es ist eine völlig andere Situation als: „${szene}“.${einfarbig ? ' (6) Der Hintergrund ist nicht einfarbig und flach (es sind Raum, Wände, Boden, Landschaft oder Möbel als Umgebung zu sehen).' : ''} Kleine Abweichungen bei Details, Haltung, Kleidung im Bildausschnitt oder Gegenständen sind OK und kein Grund für ok=false. Antworte nur als JSON mit ok und einem kurzen grund auf Deutsch.` },
    ] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' }, grund: { type: 'STRING' } }, required: ['ok', 'grund'] },
    },
  });
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  try { return JSON.parse(text); } catch { return { ok: false, grund: 'Prüfung nicht lesbar' }; }
}
