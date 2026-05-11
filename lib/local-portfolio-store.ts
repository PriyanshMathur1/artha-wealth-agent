import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface LocalStockHolding {
  id: number;
  userId: string;
  symbol: string;
  accountId: string;
  name: string;
  sector: string;
  qty: number;
  avgBuyPrice: number;
  buyDate: string;
  brokerName: string;
  notes: string;
}

interface LocalMFHolding {
  id: number;
  userId: string;
  schemeCode: string;
  schemeName: string;
  amcName: string;
  category: string;
  units: number;
  avgNav: number;
  investedAmount: number;
  buyDate: string;
}

interface LocalPortfolioDB {
  stocks: LocalStockHolding[];
  mfs: LocalMFHolding[];
  nextStockId: number;
  nextMfId: number;
}

const dataDir = path.join(process.cwd(), '.data');
const dbFile = path.join(dataDir, 'local-portfolio.json');

async function readDb(): Promise<LocalPortfolioDB> {
  try {
    const raw = await readFile(dbFile, 'utf-8');
    return JSON.parse(raw) as LocalPortfolioDB;
  } catch {
    return { stocks: [], mfs: [], nextStockId: 1, nextMfId: 1 };
  }
}

async function writeDb(db: LocalPortfolioDB) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbFile, JSON.stringify(db, null, 2), 'utf-8');
}

export async function getLocalStocks(userId: string) {
  const db = await readDb();
  return db.stocks.filter((holding) => holding.userId === userId);
}

export async function getLocalMfs(userId: string) {
  const db = await readDb();
  return db.mfs.filter((holding) => holding.userId === userId);
}

export async function upsertLocalStock(
  userId: string,
  input: Omit<LocalStockHolding, 'id' | 'userId'>,
) {
  return (await upsertLocalStocks(userId, [input]))[0];
}

export async function upsertLocalStocks(
  userId: string,
  inputs: Omit<LocalStockHolding, 'id' | 'userId'>[],
) {
  const db = await readDb();
  const results: LocalStockHolding[] = [];

  for (const input of inputs) {
    const index = db.stocks.findIndex(
      (holding) => holding.userId === userId && holding.symbol === input.symbol && holding.accountId === input.accountId,
    );

    if (index >= 0) {
      db.stocks[index] = { ...db.stocks[index], ...input, userId };
      results.push(db.stocks[index]);
    } else {
      const created: LocalStockHolding = {
        id: db.nextStockId++,
        userId,
        ...input,
      };
      db.stocks.push(created);
      results.push(created);
    }
  }

  await writeDb(db);
  return results;
}

export async function upsertLocalMf(
  userId: string,
  input: Omit<LocalMFHolding, 'id' | 'userId'>,
) {
  return (await upsertLocalMfs(userId, [input]))[0];
}

export async function upsertLocalMfs(
  userId: string,
  inputs: Omit<LocalMFHolding, 'id' | 'userId'>[],
) {
  const db = await readDb();
  const results: LocalMFHolding[] = [];

  for (const input of inputs) {
    const index = db.mfs.findIndex(
      (holding) => holding.userId === userId && holding.schemeCode === input.schemeCode,
    );

    if (index >= 0) {
      db.mfs[index] = { ...db.mfs[index], ...input, userId };
      results.push(db.mfs[index]);
    } else {
      const created: LocalMFHolding = {
        id: db.nextMfId++,
        userId,
        ...input,
      };
      db.mfs.push(created);
      results.push(created);
    }
  }

  await writeDb(db);
  return results;
}

export async function deleteLocalStock(userId: string, id: number) {
  const db = await readDb();
  db.stocks = db.stocks.filter((holding) => !(holding.userId === userId && holding.id === id));
  await writeDb(db);
}

export async function deleteLocalMf(userId: string, id: number) {
  const db = await readDb();
  db.mfs = db.mfs.filter((holding) => !(holding.userId === userId && holding.id === id));
  await writeDb(db);
}
