import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { NormalizedPortfolioHolding } from '@/lib/portfolio-assessment';
import type { WealthMessage } from '@/lib/wealth/types';

interface LocalWealthWorkspace {
  userId: string;
  workspaceId: string;
  messages: WealthMessage[];
  holdings: NormalizedPortfolioHolding[];
  riskAnswers: Record<string, number>;
  summary: string;
  updatedAt: string;
}

interface LocalWealthDB {
  workspaces: LocalWealthWorkspace[];
}

const dataDir = path.join(process.cwd(), '.data');
const dbFile = path.join(dataDir, 'local-wealth.json');
export const DEFAULT_WEALTH_WORKSPACE_ID = 'artha-wealth-default';

async function readDb(): Promise<LocalWealthDB> {
  try {
    const raw = await readFile(dbFile, 'utf-8');
    return JSON.parse(raw) as LocalWealthDB;
  } catch {
    return { workspaces: [] };
  }
}

async function writeDb(db: LocalWealthDB) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbFile, JSON.stringify(db, null, 2), 'utf-8');
}

export async function getLocalWealthWorkspace(
  userId: string,
  workspaceId = DEFAULT_WEALTH_WORKSPACE_ID,
): Promise<LocalWealthWorkspace | null> {
  const db = await readDb();
  return db.workspaces.find((workspace) => workspace.userId === userId && workspace.workspaceId === workspaceId) ?? null;
}

export async function saveLocalWealthWorkspace(
  userId: string,
  input: Omit<LocalWealthWorkspace, 'userId' | 'workspaceId' | 'updatedAt'> & { workspaceId?: string },
): Promise<LocalWealthWorkspace> {
  const db = await readDb();
  const workspaceId = input.workspaceId ?? DEFAULT_WEALTH_WORKSPACE_ID;
  const nextWorkspace: LocalWealthWorkspace = {
    userId,
    workspaceId,
    messages: input.messages,
    holdings: input.holdings,
    riskAnswers: input.riskAnswers,
    summary: input.summary,
    updatedAt: new Date().toISOString(),
  };

  const index = db.workspaces.findIndex((workspace) => workspace.userId === userId && workspace.workspaceId === workspaceId);
  if (index >= 0) {
    db.workspaces[index] = nextWorkspace;
  } else {
    db.workspaces.push(nextWorkspace);
  }

  await writeDb(db);
  return nextWorkspace;
}

export async function clearLocalWealthWorkspace(
  userId: string,
  workspaceId = DEFAULT_WEALTH_WORKSPACE_ID,
) {
  const db = await readDb();
  db.workspaces = db.workspaces.filter((workspace) => !(workspace.userId === userId && workspace.workspaceId === workspaceId));
  await writeDb(db);
}
