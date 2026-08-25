/**
 * Shared Report Date Range System
 *
 * Implements deterministic inclusive/exclusive boundaries [startOfDay, startOfNextDay)
 * using local business calendar conventions without mixing UTC date boundaries.
 */

export type DateRangePreset =
  | 'TODAY'
  | 'YESTERDAY'
  | 'THIS_WEEK'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'THIS_QUARTER'
  | 'THIS_YEAR'
  | 'CUSTOM'
  | 'ALL_TIME';

export interface DateRangeBounds {
  preset: DateRangePreset;
  startDateIso: string; // Inclusive start timestamp
  endDateIso: string;   // Exclusive end timestamp
  label: string;
}

export interface DailyBucket {
  dateStr: string; // YYYY-MM-DD
  label: string;   // "DD MMM" or "DD MMM YYYY"
  dayStartIso: string;
  dayEndIso: string;
}

/**
 * Returns a local Date with time set to 00:00:00.000
 */
export const startOfLocalDay = (date: Date = new Date()): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Returns a local Date with time set to 00:00:00.000 of the next day (exclusive boundary)
 */
export const endOfLocalDayExclusive = (date: Date = new Date()): Date => {
  const d = startOfLocalDay(date);
  d.setDate(d.getDate() + 1);
  return d;
};

/**
 * Resolves deterministic [startDateIso, endDateIso) for any date range preset.
 */
export const resolveDateRange = (
  preset: DateRangePreset = 'THIS_MONTH',
  customStart?: string,
  customEnd?: string,
  now: Date = new Date()
): DateRangeBounds => {
  const todayStart = startOfLocalDay(now);

  switch (preset) {
    case 'TODAY': {
      const start = todayStart;
      const end = endOfLocalDayExclusive(now);
      return {
        preset: 'TODAY',
        startDateIso: start.toISOString(),
        endDateIso: end.toISOString(),
        label: 'Today',
      };
    }

    case 'YESTERDAY': {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 1);
      const end = new Date(todayStart);
      return {
        preset: 'YESTERDAY',
        startDateIso: start.toISOString(),
        endDateIso: end.toISOString(),
        label: 'Yesterday',
      };
    }

    case 'THIS_WEEK': {
      // Week starting Monday (or Sunday if standard, let's use Monday as standard business week)
      const start = new Date(todayStart);
      const dayOfWeek = start.getDay(); // 0 is Sunday, 1 is Monday...
      const diffToMonday = (dayOfWeek + 6) % 7;
      start.setDate(start.getDate() - diffToMonday);

      const end = endOfLocalDayExclusive(now);
      return {
        preset: 'THIS_WEEK',
        startDateIso: start.toISOString(),
        endDateIso: end.toISOString(),
        label: 'This Week',
      };
    }

    case 'THIS_MONTH': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = endOfLocalDayExclusive(now);
      return {
        preset: 'THIS_MONTH',
        startDateIso: start.toISOString(),
        endDateIso: end.toISOString(),
        label: 'This Month',
      };
    }

    case 'LAST_MONTH': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return {
        preset: 'LAST_MONTH',
        startDateIso: start.toISOString(),
        endDateIso: end.toISOString(),
        label: 'Last Month',
      };
    }

    case 'THIS_QUARTER': {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), quarterMonth, 1, 0, 0, 0, 0);
      const end = endOfLocalDayExclusive(now);
      return {
        preset: 'THIS_QUARTER',
        startDateIso: start.toISOString(),
        endDateIso: end.toISOString(),
        label: 'This Quarter',
      };
    }

    case 'THIS_YEAR': {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const end = endOfLocalDayExclusive(now);
      return {
        preset: 'THIS_YEAR',
        startDateIso: start.toISOString(),
        endDateIso: end.toISOString(),
        label: 'This Year',
      };
    }

    case 'ALL_TIME': {
      const start = new Date(2000, 0, 1, 0, 0, 0, 0);
      const end = new Date(2099, 11, 31, 23, 59, 59, 999);
      return {
        preset: 'ALL_TIME',
        startDateIso: start.toISOString(),
        endDateIso: end.toISOString(),
        label: 'All Time',
      };
    }

    case 'CUSTOM': {
      if (customStart && customEnd) {
        const start = startOfLocalDay(new Date(customStart));
        const end = endOfLocalDayExclusive(new Date(customEnd));
        return {
          preset: 'CUSTOM',
          startDateIso: start.toISOString(),
          endDateIso: end.toISOString(),
          label: `${customStart.slice(0, 10)} to ${customEnd.slice(0, 10)}`,
        };
      }
      // Default fallback to this month if custom range is incomplete
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = endOfLocalDayExclusive(now);
      return {
        preset: 'CUSTOM',
        startDateIso: start.toISOString(),
        endDateIso: end.toISOString(),
        label: 'Custom Range',
      };
    }
  }
};

/**
 * Checks whether a given ISO date string is within the [startDateIso, endDateIso) range.
 */
export const isDateInRange = (
  dateIso: string | undefined | null,
  startDateIso: string,
  endDateIso: string
): boolean => {
  if (!dateIso) return false;
  const time = new Date(dateIso).getTime();
  const start = new Date(startDateIso).getTime();
  const end = new Date(endDateIso).getTime();
  return time >= start && time < end;
};

/**
 * Generates an array of daily buckets covering the range for trend analysis.
 */
export const getDailyBuckets = (startDateIso: string, endDateIso: string): DailyBucket[] => {
  const buckets: DailyBucket[] = [];
  const start = startOfLocalDay(new Date(startDateIso));
  const end = new Date(endDateIso);

  const current = new Date(start);
  while (current.getTime() < end.getTime()) {
    const dayStartIso = current.toISOString();
    const nextDay = endOfLocalDayExclusive(current);
    const dayEndIso = nextDay.toISOString();

    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const label = `${current.getDate()} ${monthNames[current.getMonth()]}`;

    buckets.push({
      dateStr,
      label,
      dayStartIso,
      dayEndIso,
    });

    current.setDate(current.getDate() + 1);
  }

  return buckets;
};
