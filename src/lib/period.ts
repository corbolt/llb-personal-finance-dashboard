import { isIsoMonth, monthOf, type IsoDate, type IsoMonth } from "./dates";

export interface MonthBounds {
  /** First and last month for which there is data. */
  min: IsoMonth;
  max: IsoMonth;
}

export function monthBounds(firstDate: IsoDate, lastDate: IsoDate): MonthBounds {
  return { min: monthOf(firstDate), max: monthOf(lastDate) };
}

/**
 * The month a page should show: the requested one if it has data, otherwise
 * the most recent month with data — which is where a monthly import lands.
 */
export function resolveMonth(requested: string | undefined, bounds: MonthBounds): IsoMonth {
  if (requested && isIsoMonth(requested) && requested >= bounds.min && requested <= bounds.max) {
    return requested;
  }
  return bounds.max;
}
