/**
 * NSE / BSE market state helper.
 *
 * Used by Group 3 to decide whether a "5-minute-old quote" is stale.
 * During market hours: yes, stale. After-hours: no, that's the latest
 * available so don't badge it as stale.
 *
 * The holiday list is a snapshot — Ralph should keep it current. Pulling it
 * dynamically from NSE is on the backlog (out-of-scope for this task).
 */

/** Indian market trading window in IST. */
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 15;
const MARKET_CLOSE_HOUR = 15;
const MARKET_CLOSE_MINUTE = 30;

/** Trading holidays for the current year. Update annually.
 *  Source: https://www.nseindia.com/resources/exchange-communication-holidays */
const HOLIDAYS_2026: string[] = [
  '2026-01-26', // Republic Day
  '2026-03-04', // Holi
  '2026-03-19', // Eid-ul-Fitr (tentative)
  '2026-04-03', // Mahavir Jayanti
  '2026-04-14', // Good Friday / Ambedkar Jayanti
  '2026-05-01', // Maharashtra Day
  '2026-05-26', // Eid-ul-Adha (tentative)
  '2026-06-26', // Muharram (tentative)
  '2026-08-15', // Independence Day (Saturday — exchange closed anyway)
  '2026-08-26', // Ganesh Chaturthi
  '2026-10-02', // Mahatma Gandhi Jayanti
  '2026-10-21', // Diwali Laxmi Pujan (special trading session usually)
  '2026-10-22', // Diwali Balipratipada
  '2026-11-04', // Guru Nanak Jayanti
  '2026-12-25', // Christmas
];

const HOLIDAY_SET = new Set(HOLIDAYS_2026);

/** Convert a Date to YYYY-MM-DD in IST. */
function toISTDateKey(d: Date): string {
  // IST is UTC+5:30 with no DST.
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const yyyy = ist.getUTCFullYear();
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Convert a Date to {hour, minute} in IST. */
function toISTHM(d: Date): { hour: number; minute: number; weekday: number } {
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  return {
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    weekday: ist.getUTCDay(), // 0 = Sun
  };
}

/** True iff `now` falls inside an NSE trading session. */
export function isMarketOpen(now: Date = new Date()): boolean {
  const dateKey = toISTDateKey(now);
  if (HOLIDAY_SET.has(dateKey)) return false;
  const { hour, minute, weekday } = toISTHM(now);
  if (weekday === 0 || weekday === 6) return false; // weekend

  const minutesIntoDay = hour * 60 + minute;
  const open = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
  const close = MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE;
  return minutesIntoDay >= open && minutesIntoDay < close;
}

/** Human-readable session label for the UI. */
export function marketStateLabel(now: Date = new Date()): 'open' | 'closed' | 'holiday' | 'weekend' {
  const dateKey = toISTDateKey(now);
  if (HOLIDAY_SET.has(dateKey)) return 'holiday';
  const { weekday } = toISTHM(now);
  if (weekday === 0 || weekday === 6) return 'weekend';
  return isMarketOpen(now) ? 'open' : 'closed';
}
