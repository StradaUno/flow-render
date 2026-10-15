// Neue Pose einer Figur über Google Vertex AI (gleicher Weg wie die Bibliothek: Referenzbild + Szene, 9:16)
// Zugang: Dienstkonto-Schlüssel (JSON) im GitHub-Secret FLOW_VERTEX_KEY. Gibt keine Inhalte aus.
import { createSign } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
let token = null;

async function zugang() {
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

async function bildErzeugen(a) {
  const z = await zugang();
  const ref = await fetch(a.referenz_url);
  if (!ref.ok) throw new Error(`Referenzbild: HTTP ${ref.status}`);
  const refDaten = Buffer.from(await ref.arrayBuffer()).toString('base64');
  const mime = /\.png(\?|$)/i.test(a.referenz_url) ? 'image/png' : 'image/jpeg';
  const host = a.ort === 'global' ? 'aiplatform.googleapis.com' : `${a.ort}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${z.projekt}/locations/${a.ort}/publishers/google/models/${a.modell}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: refDaten } }, { text: a.prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } },
  };
  let letzte = '';
  for (let v = 0; v < 4; v++) {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${z.wert}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const teil = (j.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
      if (teil) return Buffer.from(teil.inlineData.data, 'base64');
      letzte = 'kein Bild in der Antwort (evtl. Inhaltsfilter)';
    } else {
      letzte = `Vertex HTTP ${r.status}: ${j.error?.message ?? ''}`.slice(0, 300);
      if (r.status !== 429 && r.status < 500) break;
    }
    await new Promise((res) => setTimeout(res, 15000 * (v + 1)));
  }
  throw new Error(letzte);
}

async function hochladen(signedUrl, datei) {
  const r = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: await readFile(datei) });
  if (!r.ok) throw new Error(`Upload ${r.status}`);
}

export async function poseBauen(a) {
  const roh = await bildErzeugen(a);
  const ordner = await mkdtemp(join(tmpdir(), 'pose-'));
  try {
    const ein = join(ordner, 'roh.png'), gross = join(ordner, 'bild.jpg'), klein = join(ordner, 'klein.jpg');
    await writeFile(ein, roh);
    // wie die Bibliothek: 1080×1920 JPEG + 360 px Vorschau
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', ein, '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920', '-q:v', '3', gross]);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', gross, '-vf', 'scale=360:-2', '-q:v', '4', klein]);
    await hochladen(a.upload.jpg.signedUrl, gross);
    await hochladen(a.upload.klein.signedUrl, klein);
    return { jpg: a.upload.jpg.pfad, klein: a.upload.klein.pfad };
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
}
