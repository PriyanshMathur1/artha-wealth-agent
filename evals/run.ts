/**
 * Eval runner — calls `ralphRespond` directly against the golden-set
 * fixtures and prints a pass/fail table. Writes results JSON for the
 * regression gate.
 *
 * Usage:
 *   npx tsx evals/run.ts                       # all fixtures, with LLM judge
 *   npx tsx evals/run.ts --no-llm              # deterministic only (CI)
 *   npx tsx evals/run.ts --fixture stock-buy   # single fixture, debug mode
 *
 * Why direct calls instead of HTTP
 * --------------------------------
 * Going through `/api/chat` would require booting Next.js, double the
 * latency, and add a network failure mode that has nothing to do with the
 * agents. The compliance layer is in `ralphRespond`, not in the route, so
 * direct calls still get sanitised output. (See guardrails.md sign:
 * "Eval calls ralphRespond directly, NOT HTTP".)
 */

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ralphRespond } from '@/lib/ralph/orchestrator';
import { judge } from './judge';
import type { Fixture, JudgeResult, RunSummary } from './types';

interface CliArgs {
  noLLM: boolean;
  fixture?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { noLLM: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--no-llm') args.noLLM = true;
    if (argv[i] === '--fixture') args.fixture = argv[++i];
  }
  return args;
}

function loadFixtures(filter?: string): Fixture[] {
  const dir = join(process.cwd(), 'evals', 'golden');
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const all: Fixture[] = files.map((f) =>
    JSON.parse(readFileSync(join(dir, f), 'utf-8')),
  );
  return filter ? all.filter((fx) => fx.id === filter) : all;
}

async function runOne(fx: Fixture, useLLM: boolean): Promise<JudgeResult> {
  if (fx.skip) {
    return {
      fixtureId: fx.id,
      passed: true,
      score: 1,
      failures: [],
      judgeNotes: 'skipped',
    };
  }
  const turns = [{ role: 'user' as const, content: fx.prompt }];
  const res = await ralphRespond({ turns, userId: fx.userId ?? null });
  return judge(res, fx, { useLLM });
}

function loadPriorPassRate(): number | null {
  const dir = join(process.cwd(), 'evals', 'results');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) return null;
  const last = JSON.parse(readFileSync(join(dir, files[files.length - 1]), 'utf-8')) as RunSummary;
  return last.passRate;
}

function persist(summary: RunSummary): string {
  const dir = join(process.cwd(), 'evals', 'results');
  mkdirSync(dir, { recursive: true });
  const filename = `${summary.startedAt.replace(/[:.]/g, '-')}.json`;
  const path = join(dir, filename);
  writeFileSync(path, JSON.stringify(summary, null, 2));
  return path;
}

function printTable(results: JudgeResult[]): void {
  const idWidth = Math.max(8, ...results.map((r) => r.fixtureId.length));
  console.log('\n' + '─'.repeat(idWidth + 30));
  console.log(
    `${'ID'.padEnd(idWidth)}  ${'STATUS'.padEnd(8)}  ${'SCORE'.padEnd(6)}  FAILURES`,
  );
  console.log('─'.repeat(idWidth + 30));
  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    const score = r.score.toFixed(2);
    const fail = r.failures.join('; ').slice(0, 80);
    console.log(`${r.fixtureId.padEnd(idWidth)}  ${status.padEnd(8)}  ${score.padEnd(6)}  ${fail}`);
  }
  console.log('─'.repeat(idWidth + 30));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const fixtures = loadFixtures(args.fixture);

  if (fixtures.length === 0) {
    console.error('No fixtures found. Add JSON files to evals/golden/.');
    process.exit(args.fixture ? 1 : 0);
  }

  console.log(`Running ${fixtures.length} fixture(s) — LLM judge: ${!args.noLLM ? 'on' : 'off'}\n`);

  const results: JudgeResult[] = [];
  for (const fx of fixtures) {
    process.stdout.write(`  ${fx.id} … `);
    try {
      const r = await runOne(fx, !args.noLLM);
      results.push(r);
      process.stdout.write(r.passed ? 'pass\n' : 'fail\n');
    } catch (err) {
      results.push({
        fixtureId: fx.id,
        passed: false,
        score: 0,
        failures: [`runner error: ${err instanceof Error ? err.message : 'unknown'}`],
        judgeNotes: '',
      });
      process.stdout.write('error\n');
    }
  }

  const passed = results.filter((r) => r.passed && !fixtures.find((f) => f.id === r.fixtureId)?.skip).length;
  const skipped = results.filter((r) => fixtures.find((f) => f.id === r.fixtureId)?.skip).length;
  const failed = results.length - passed - skipped;
  const passRate = (passed + skipped) / results.length;

  const prior = loadPriorPassRate();
  const regressed = prior !== null && passRate < prior - 0.05;

  const summary: RunSummary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    totalFixtures: fixtures.length,
    passed,
    failed,
    skipped,
    passRate,
    results,
    regressed,
  };

  printTable(results);
  console.log(
    `\n${passed} passed · ${failed} failed · ${skipped} skipped · ` +
      `pass rate ${(passRate * 100).toFixed(1)}%` +
      (prior !== null ? ` (prior: ${(prior * 100).toFixed(1)}%)` : ''),
  );

  const resultsPath = persist(summary);
  console.log(`\nResults written to ${resultsPath}`);

  if (failed > 0) {
    console.error('\n✗ Some fixtures failed.');
    process.exit(1);
  }
  if (regressed) {
    console.error(
      `\n✗ Regression: pass-rate dropped from ${(prior! * 100).toFixed(1)}% to ${(passRate * 100).toFixed(1)}%`,
    );
    process.exit(1);
  }
  console.log('\n✓ All fixtures passing.');
}

main().catch((err) => {
  console.error('Eval runner crashed:', err);
  process.exit(2);
});
