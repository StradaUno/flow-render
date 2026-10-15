// Reel bauen: Figurenbild mit Zoom hin und zurück (nahtloser Loop), Szene → Szene + Pointe, Musik ab Sekunde 0.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schriftStufe, textflaechePng } from './textflaeche.mjs';

const ausfuehren = promisify(execFile);

async function laden(url, ziel) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download fehlgeschlagen (${r.status})`);
  await writeFile(ziel, Buffer.from(await r.arrayBuffer()));
}

async function hochladen(signedUrl, datei, typ) {
  const r = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': typ, 'x-upsert': 'true' }, body: await readFile(datei) });
  if (!r.ok) throw new Error(`Upload fehlgeschlagen (${r.status})`);
}

export async function reelBauen(browser, a) {
  const dir = await mkdtemp(join(tmpdir(), 'reel-'));
  try {
    const R = a.reel;
    const B = R.breite, H = R.hoehe, fps = R.fps, L = R.laenge_s;
    const frames = Math.round(L * fps);
    const zmax = R.zoom_max;

    await laden(a.bild_url, join(dir, 'bild.jpg'));
    if (a.musik_url) await laden(a.musik_url, join(dir, 'musik'));

    // Szene (text1) steht von Anfang an; ab wechsel_s kommt die Pointe (text2) darunter dazu
    const t2 = (a.text2 ?? '').trim();
    const wechsel = t2 ? Math.min(Math.max(a.wechsel_s || 3, 1), L - 1) : L;
    const stufe = schriftStufe(a.text1, t2, a.ruhig_ab ?? 18);
    const basis = { stil: a.stil, texthoehe: a.texthoehe, breite: B, hoehe: H, ...stufe, unterkante: 0.42 };
    if (t2) {
      const schrift = await textflaechePng(browser, { ...basis, text: `${a.text1}\n\n${t2}` }, join(dir, 't2.png'));
      await textflaechePng(browser, { ...basis, schrift, unterkante: 0, text: a.text1 }, join(dir, 't1.png'));
    } else {
      await textflaechePng(browser, { ...basis, text: a.text1 }, join(dir, 't1.png'));
    }

    const args = ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', String(fps), '-i', join(dir, 'bild.jpg'), '-loop', '1', '-i', join(dir, 't1.png')];
    if (t2) args.push('-loop', '1', '-i', join(dir, 't2.png'));
    const audioIdx = t2 ? 3 : 2;
    if (a.musik_url) args.push('-ss', String(a.musik_start || 0), '-t', String(L), '-i', join(dir, 'musik'));
    else args.push('-f', 'lavfi', '-t', String(L), '-i', 'anullsrc=r=44100:cl=stereo');

    // Zoom: weich hinein bis zur Hälfte der Laufzeit, dann zurück → erstes = letztes Bild (Loop)
    // zoom_raus: beginnt nah und fährt erst heraus (Abwechslung bei wiederholten Bildern)
    const welle = `(1-cos(2*PI*on/${frames}))/2`;
    const z = a.zoom_raus ? `${zmax.toFixed(4)}-${(zmax - 1).toFixed(4)}*${welle}` : `1+${(zmax - 1).toFixed(4)}*${welle}`;
    let f = `[0:v]${a.spiegeln ? 'hflip,' : ''}scale=${B * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${B * 2}:${H * 2},` +
      `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${B}x${H}:fps=${fps},setsar=1[bg];` +
      `[bg][1:v]overlay=0:0:enable='lt(t,${wechsel})'[v1]`;
    if (t2) f += `;[v1][2:v]overlay=0:0:enable='gte(t,${wechsel})'[v]`;
    else f += `;[v1]null[v]`;
    f += `;[${audioIdx}:a]afade=t=in:st=0:d=0.05,afade=t=out:st=${(L - R.ausblenden_s).toFixed(2)}:d=${R.ausblenden_s},apad[a]`;

    const mp4 = join(dir, 'reel.mp4');
    args.push('-filter_complex', f, '-map', '[v]', '-map', '[a]', '-t', String(L), '-frames:v', String(frames),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(fps),
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart', mp4);
    await ausfuehren('ffmpeg', args, { maxBuffer: 1 << 24 });

    const jpg = join(dir, 'vorschau.jpg');
    await ausfuehren('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.5', '-i', mp4, '-frames:v', '1', '-vf', 'scale=540:960', '-q:v', '3', jpg]);

    await hochladen(a.upload.mp4.signedUrl, mp4, 'video/mp4');
    await hochladen(a.upload.jpg.signedUrl, jpg, 'image/jpeg');
    return { mp4: a.upload.mp4.pfad, jpg: a.upload.jpg.pfad };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
