export type GenderFilter = 'male' | 'female' | 'any';

export const GENDER_FILTER_VALUES: GenderFilter[] = ['male', 'female', 'any'];

/** No real gender field exists on the client's User model yet — this only
 * buckets waiting users by their requested filter and pairs first-come,
 * first-served among mutually compatible requests. `any` matches anything. */
export function genderFiltersCompatible(
  a: GenderFilter,
  b: GenderFilter,
): boolean {
  return a === 'any' || b === 'any' || a === b;
}
