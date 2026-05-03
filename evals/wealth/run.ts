import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateArthaWealthReply } from '@/lib/wealth/assistant';
import type { NormalizedPortfolioHolding } from '@/lib/portfolio-assessment';
import type { WealthMessage } from '@/lib/wealth/types';

interface WealthFixture {
  id: string;
  prompt: string;
  holdings: NormalizedPortfolioHolding[];
  riskAnswers?: Record<string, number>;
  expectedIncludes: string[];
  forbiddenIncludes?: string[];
}

function loadFixtures(): WealthFixture[] {
  const dir = join(process.cwd(), 'evals', 'wealth', 'golden');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf-8')) as WealthFixture);
}

async function main() {
  const fixtures = loadFixtures();
  let failed = 0;

  for (const fixture of fixtures) {
    const messages: WealthMessage[] = [
      {
        id: `${fixture.id}-user`,
        role: 'user',
        content: fixture.prompt,
        createdAt: new Date().toISOString(),
      },
    ];
    const reply = await generateArthaWealthReply({
      messages,
      holdings: fixture.holdings,
      riskAnswers: fixture.riskAnswers ?? {},
    });

    const haystack = `${reply.answer}\n${reply.suggestions.join('\n')}`.toLowerCase();
    const misses = fixture.expectedIncludes.filter((needle) => !haystack.includes(needle.toLowerCase()));
    const violations = (fixture.forbiddenIncludes ?? []).filter((needle) => haystack.includes(needle.toLowerCase()));
    const passed = misses.length === 0 && violations.length === 0;
    if (!passed) failed += 1;

    console.log(`${passed ? 'PASS' : 'FAIL'} ${fixture.id}`);
    if (!passed) {
      if (misses.length > 0) console.log(`  missing: ${misses.join(', ')}`);
      if (violations.length > 0) console.log(`  forbidden: ${violations.join(', ')}`);
    }
  }

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
