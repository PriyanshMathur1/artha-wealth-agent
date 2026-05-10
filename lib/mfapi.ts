const BASE = 'https://api.mfapi.in/mf';

export interface MFScheme {
  schemeCode: string;
  schemeName: string;
  amcName?: string;
  schemeType?: string;
  schemeCategory?: string;
  schemeNavName?: string;
}

export interface NavEntry {
  date: string;
  nav: string;
}

export interface MFDetail {
  meta: {
    scheme_code: number;
    scheme_name: string;
    fund_house: string;
    scheme_type: string;
    scheme_category: string;
    scheme_sub_category?: string;
    scheme_nav_name?: string;
  };
  data: NavEntry[];
}

export interface TrailingReturns {
  '1W': number | null;
  '1M': number | null;
  '3M': number | null;
  '6M': number | null;
  '1Y': number | null;
}

export interface MFDirection {
  status: 'positive' | 'negative' | 'sideways';
  trailing3M: number | null;
  trailing1Y: number | null;
  trend: number[];
  consecutiveUnderperformMonths: number;
}

let schemeListCache: MFScheme[] | null = null;
let schemeListFetchedAt = 0;
const SCHEME_LIST_TTL = 24 * 60 * 60 * 1000;

export async function getAllMFSchemes(): Promise<MFScheme[]> {
  if (schemeListCache && Date.now() - schemeListFetchedAt < SCHEME_LIST_TTL) {
    return schemeListCache;
  }
  const res = await fetch(BASE, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error('Failed to fetch MF scheme list');
  const data = await res.json() as Array<{ schemeCode: number; schemeName: string }>;
  schemeListCache = data.map((s) => ({
    schemeCode: String(s.schemeCode),
    schemeName: s.schemeName,
  }));
  schemeListFetchedAt = Date.now();
  return schemeListCache;
}

export async function searchMFSchemes(query: string, limit = 20): Promise<MFScheme[]> {
  const all = await getAllMFSchemes();
  const q = query.toLowerCase();
  return all.filter((s) => s.schemeName.toLowerCase().includes(q)).slice(0, limit);
}

export async function getMFDetail(schemeCode: string): Promise<MFDetail> {
  const res = await fetch(`${BASE}/${schemeCode}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Failed to fetch MF detail for ${schemeCode}`);
  return res.json() as Promise<MFDetail>;
}

export async function getMFNavHistory(schemeCode: string, days = 365): Promise<NavEntry[]> {
  const detail = await getMFDetail(schemeCode);
  return detail.data.slice(0, days);
}

function parseNav(nav: string): number {
  return parseFloat(nav.replace(/,/g, ''));
}

function navDaysAgo(data: NavEntry[], daysAgo: number): number | null {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysAgo);
  const [dd, mm, yyyy] = (data[0]?.date ?? '').split('-');
  void dd; void mm; void yyyy;

  for (const entry of data) {
    const parts = entry.date.split('-');
    let entryDate: Date;
    if (parts[0].length === 4) {
      entryDate = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
    } else {
      entryDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    if (entryDate <= cutoff) return parseNav(entry.nav);
  }
  return null;
}

export async function getMFTrailingReturns(schemeCode: string): Promise<TrailingReturns> {
  try {
    const detail = await getMFDetail(schemeCode);
    const data = detail.data;
    if (!data.length) return { '1W': null, '1M': null, '3M': null, '6M': null, '1Y': null };

    const currentNav = parseNav(data[0].nav);

    function pct(old: number | null): number | null {
      if (!old || old === 0) return null;
      return ((currentNav - old) / old) * 100;
    }

    return {
      '1W': pct(navDaysAgo(data, 7)),
      '1M': pct(navDaysAgo(data, 30)),
      '3M': pct(navDaysAgo(data, 90)),
      '6M': pct(navDaysAgo(data, 180)),
      '1Y': pct(navDaysAgo(data, 365)),
    };
  } catch (error) {
    return { '1W': null, '1M': null, '3M': null, '6M': null, '1Y': null };
  }
}

// Returns the latest NAV as a float. Caches in MFNavCache table if prisma is provided.
export async function getCurrentNav(schemeCode: string): Promise<number> {
  const detail = await getMFDetail(schemeCode);
  const latest = detail.data[0];
  if (!latest) throw new Error(`No NAV data for scheme ${schemeCode}`);
  return parseNav(latest.nav);
}

export async function getMFDirection(schemeCode: string): Promise<MFDirection> {
  try {
    const detail = await getMFDetail(schemeCode);
    const data = detail.data;
    if (!data.length) {
      return { status: 'sideways', trailing3M: null, trailing1Y: null, trend: [], consecutiveUnderperformMonths: 0 };
    }

    const currentNav = parseNav(data[0].nav);
    const nav3MAgo = navDaysAgo(data, 90);
    const nav1YAgo = navDaysAgo(data, 365);

    const trailing3M = nav3MAgo ? ((currentNav - nav3MAgo) / nav3MAgo) * 100 : null;
    const trailing1Y = nav1YAgo ? ((currentNav - nav1YAgo) / nav1YAgo) * 100 : null;

    const trend = data
      .slice(0, 180)
      .filter((_, i) => i % 7 === 0)
      .map((e) => parseNav(e.nav))
      .reverse();

    let consecutiveUnderperformMonths = 0;
    for (let m = 1; m <= 6; m++) {
      const old = navDaysAgo(data, m * 30);
      const ref = navDaysAgo(data, (m + 1) * 30);
      if (old && ref && old < ref) {
        consecutiveUnderperformMonths++;
      } else {
        break;
      }
    }

    let status: 'positive' | 'negative' | 'sideways' = 'sideways';
    if (trailing3M !== null) {
      if (trailing3M > 2) status = 'positive';
      else if (trailing3M < -2) status = 'negative';
    }

    return { status, trailing3M, trailing1Y, trend, consecutiveUnderperformMonths };
  } catch (error) {
    return { status: 'sideways', trailing3M: null, trailing1Y: null, trend: [], consecutiveUnderperformMonths: 0 };
  }
}
