// Selbsttest ohne echte Daten: baut ein Probe-Reel aus einem erzeugten Bild und einem Testton.
// Ergebnis landet in ./selbsttest/ (wird im Workflow als Artefakt angehängt).
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { reelBauen } from './render.mjs';

const ausfuehren = promisify(execFile);
const dir = new URL('./selbsttest/', import.meta.url).pathname;
await mkdir(dir, { recursive: true });

await ausfuehren('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'gradients=s=1080x1920:c0=0x9AB8E8:c1=0xF1E6D8:x0=0:y0=0:x1=1080:y1=1920', '-vf',
  "drawbox=x=340:y=900:w=400:h=700:color=0x6B4F3A@1:t=fill,drawbox=x=420:y=980:w=80:h=80:color=white@1:t=fill,drawbox=x=580:y=980:w=80:h=80:color=white@1:t=fill",
  '-frames:v', '1', `${dir}bild.jpg`]);
await ausfuehren('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=20', '-c:a', 'libmp3lame', `${dir}musik.mp3`]);

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET') { res.end(await readFile(dir + req.url.slice(1))); return; }
  const teile = []; for await (const t of req) teile.push(t);
  await writeFile(dir + 'ausgabe-' + req.url.slice(1), Buffer.concat(teile)); res.end('ok');
}).listen(8787);

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PFAD ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const t0 = Date.now();
await reelBauen(browser, {
  bild_url: 'http://localhost:8787/bild.jpg', musik_url: 'http://localhost:8787/musik.mp3', musik_start: 2,
  text1: 'Montag. Ich bin da. Körperlich.', text2: 'Geistig? Kommt Mittwoch.', wechsel_s: 3, texthoehe: 0.08, handle: 'pipo.memes',
  stil: { k: 'klar', box: '#FFFFFF', fg: '#18181B', rand: '#E7E5E4' },
  reel: { breite: 1080, hoehe: 1920, laenge_s: 7, zoom_max: 1.15, fps: 30, ausblenden_s: 0.6 },
  upload: { mp4: { signedUrl: 'http://localhost:8787/reel.mp4', pfad: 'reel.mp4' }, jpg: { signedUrl: 'http://localhost:8787/vorschau.jpg', pfad: 'vorschau.jpg' } },
});
console.log(`Probe-Reel gebaut in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const { stdout } = await ausfuehren('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,duration,r_frame_rate', '-of', 'compact', `${dir}ausgabe-reel.mp4`]);
console.log(stdout);
await browser.close();
server.close();
