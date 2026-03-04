import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const MODELS = ['qwen2.5-coder:14b', 'deepseek-r1:14b'];

const systemPrompt = readFileSync(
  'd:/sources/repos/ostra/ollama-agents/angular-reviewer/system.md',
  'utf8'
);
const testCode = readFileSync(join(__dirname, 'test-component.ts'), 'utf8');

const KNOWN_BUGS = [
  { id: 1, description: '[innerHTML] avec donnees non sanitisees (XSS)', line: 24 },
  { id: 2, description: 'valueChanges.subscribe() sans takeUntilDestroyed (fuite memoire)', line: 67 },
  { id: 3, description: 'localStorage injecte dans innerHTML (XSS)', line: 69 },
  { id: 4, description: 'Erreur avalee (console.log) + isLoading jamais reset en erreur', line: 76 },
  { id: 5, description: 'async/await fetch() hors zone Angular', line: '97-99' },
  { id: 6, description: '.filter() sans assignation (resultat ignore)', line: '103-104' },
  { id: 7, description: '== au lieu de = (comparaison au lieu d\'affectation)', line: 113 },
  { id: 8, description: '*ngIf au lieu de @if (melange syntaxes)', line: 37 },
];

const userPrompt = `Review ce composant Angular. Identifie TOUS les bugs, problemes de securite, fuites memoire et violations de conventions. Sois exhaustif.\n\n\`\`\`typescript\n${testCode}\n\`\`\``;

async function runModel(model) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Modele: ${model}`);
  console.log(`${'='.repeat(60)}`);

  const start = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10 min
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      options: { temperature: 0.2, num_gpu: 99 },
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  const result = await response.json();
  const elapsed = Date.now() - start;
  const content = result.message?.content ?? '';
  const evalCount = result.eval_count ?? 0;
  const evalDuration = (result.eval_duration ?? 0) / 1e9;
  const tokPerSec = evalDuration > 0 ? (evalCount / evalDuration).toFixed(1) : 'N/A';

  console.log(`\nReponse (${evalCount} tokens, ${evalDuration.toFixed(1)}s, ${tokPerSec} tok/s):\n`);
  console.log(content);

  // Score: check which known bugs were found
  const contentLower = content.toLowerCase();
  const found = [];
  const missed = [];

  for (const bug of KNOWN_BUGS) {
    const keywords = getKeywords(bug.id);
    const detected = keywords.some((kw) => contentLower.includes(kw));
    if (detected) {
      found.push(bug);
    } else {
      missed.push(bug);
    }
  }

  console.log(`\n--- SCORE: ${found.length}/${KNOWN_BUGS.length} bugs trouves ---`);
  console.log(`\nTrouves:`);
  for (const b of found) console.log(`  [OK] #${b.id} ${b.description}`);
  console.log(`\nRates:`);
  for (const b of missed) console.log(`  [X]  #${b.id} ${b.description}`);

  return {
    model,
    score: found.length,
    total: KNOWN_BUGS.length,
    found: found.map((b) => b.id),
    missed: missed.map((b) => b.id),
    tokens: evalCount,
    duration: evalDuration,
    tokPerSec: parseFloat(tokPerSec) || 0,
    totalTime: elapsed,
  };
}

function getKeywords(bugId) {
  switch (bugId) {
    case 1: return ['innerhtml', 'xss', 'sanitiz', 'bypasssecurity', 'domsanitizer'];
    case 2: return ['takeuntil', 'unsubscribe', 'fuite', 'leak', 'destroy', 'subscription'];
    case 3: return ['localstorage', 'injection', 'xss'];
    case 4: return ['console.log', 'isloading', 'error', 'erreur aval', 'silenc'];
    case 5: return ['fetch', 'ngzone', 'zone', 'async', 'hors zone', 'outside'];
    case 6: return ['filter', 'assign', 'affectation', 'resultat ignor', 'return value', 'does not modify', 'no assignment', 'reassign'];
    case 7: return ['== ', '===', 'comparaison', 'assignment', 'affectation', 'role ==', 'role ='];
    case 8: return ['*ngif', '@if', 'ngif', 'control flow', 'ancienne syntaxe'];
  }
  return [];
}

async function main() {
  console.log('Benchmark Angular Code Review — LLM locaux');
  console.log(`${MODELS.length} modeles, ${KNOWN_BUGS.length} bugs plantes\n`);

  const results = [];
  for (const model of MODELS) {
    try {
      const result = await runModel(model);
      results.push(result);
    } catch (err) {
      console.error(`Erreur avec ${model}:`, err.message);
      results.push({ model, score: 0, total: KNOWN_BUGS.length, error: err.message });
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('RESULTATS FINAUX');
  console.log(`${'='.repeat(60)}`);
  console.log(`\n| Modele | Score | Tokens | Vitesse | Temps total |`);
  console.log(`|--------|-------|--------|---------|-------------|`);
  for (const r of results) {
    const time = r.totalTime ? `${(r.totalTime / 1000).toFixed(0)}s` : 'N/A';
    console.log(
      `| ${r.model.padEnd(22)} | ${r.score}/${r.total}   | ${String(r.tokens ?? 'N/A').padStart(6)} | ${String(r.tokPerSec ?? 'N/A').padStart(7)} t/s | ${time.padStart(11)} |`
    );
  }

  writeFileSync(
    join(__dirname, 'results.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('\nResultats sauvegardes dans benchmark/results.json');
}

main();
