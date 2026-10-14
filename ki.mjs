// KI-Auftrag mit Claude Code ausführen (Transport "abo"): eigener System-Prompt, keine Werkzeuge,
// gleiches Modell, gleiche Token-Grenze, gleiches Antwortformat wie über die API.
import { spawn } from 'node:child_process';

export function kiAusfuehren(a) {
  return new Promise((ok, fehl) => {
    const args = [
      '-p', '--output-format', 'json', '--model', a.modell, '--effort', a.effort ?? 'low',
      '--system-prompt', a.system, '--json-schema', JSON.stringify(a.schema),
      '--tools', '', '--no-session-persistence', '--strict-mcp-config',
    ];
    const p = spawn('claude', args, {
      env: { ...process.env, CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(a.max_tokens), DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let aus = '', err = '';
    const zeit = setTimeout(() => { p.kill('SIGKILL'); fehl(new Error('Zeitüberschreitung KI')); }, 5 * 60 * 1000);
    p.stdout.on('data', (d) => (aus += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => {
      clearTimeout(zeit);
      let j;
      try { j = JSON.parse(aus); } catch { return fehl(new Error(`Claude-Ausgabe nicht lesbar (Code ${code}): ${err.slice(0, 200)}`)); }
      if (j.is_error) return fehl(new Error(`Claude-Fehler: ${String(j.result).slice(0, 300)}`));
      let daten = j.structured_output;
      if (!daten) { try { daten = JSON.parse(j.result); } catch { return fehl(new Error('Keine strukturierte Antwort')); } }
      const u = j.usage ?? {};
      ok({ daten, nutzung: { modell: a.modell, ein: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), aus: u.output_tokens ?? 0 } });
    });
    p.stdin.end(a.nachricht);
  });
}
