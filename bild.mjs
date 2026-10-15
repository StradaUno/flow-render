// Bild bei Bedarf (TEXTE-BILDER-PLAN 3.3–3.5): erzeugen, prüfen, höchstens 1 Neuversuch, als WebP hochladen.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bildErzeugen, bildPruefen, bildTeil } from './vertex.mjs';

const run = promisify(execFile);

async function hochladen(signedUrl, datei, typ) {
  const r = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': typ, 'x-upsert': 'true' }, body: await readFile(datei) });
  if (!r.ok) throw new Error(`Upload ${r.status}`);
}

/** a: { prompt, vorlagen_urls, modell, pruef_modell, ort, szene_text, versuche, upload: { bild, klein } } */
export async function bildBauen(a) {
  const vorlagen = await Promise.all(a.vorlagen_urls.map(bildTeil));
  const protokoll = [];
  let roh = null;
  for (let v = 1; v <= (a.versuche ?? 2); v++) {
    let kandidat;
    try { kandidat = await bildErzeugen({ prompt: a.prompt, vorlagen, modell: a.modell, ort: a.ort }); }
    catch (e) { protokoll.push({ versuch: v, erzeugt: false, grund: String(e?.message ?? e).slice(0, 200) }); continue; }
    const p = await bildPruefen({ bild: kandidat, vorlage: vorlagen[0], szene: a.szene_text, modell: a.pruef_modell, ort: a.ort })
      .catch((e) => ({ ok: false, grund: `Prüfung fehlgeschlagen: ${String(e?.message ?? e).slice(0, 150)}` }));
    protokoll.push({ versuch: v, erzeugt: true, ok: !!p.ok, grund: p.grund ?? '' });
    if (p.ok) { roh = kandidat; break; }
  }
  if (!roh) return { ok: false, protokoll };

  const ordner = await mkdtemp(join(tmpdir(), 'bild-'));
  try {
    const ein = join(ordner, 'roh.png'), gross = join(ordner, 'bild.webp'), klein = join(ordner, 'klein.webp');
    await writeFile(ein, roh);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', ein, '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920', '-c:v', 'libwebp', '-quality', '86', gross]);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', gross, '-vf', 'scale=360:-2', '-c:v', 'libwebp', '-quality', '80', klein]);
    await hochladen(a.upload.bild.signedUrl, gross, 'image/webp');
    await hochladen(a.upload.klein.signedUrl, klein, 'image/webp');
    return { ok: true, bild: a.upload.bild.pfad, klein: a.upload.klein.pfad, protokoll };
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
}
