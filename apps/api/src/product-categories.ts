// These are the permanent top-level inventory categories.
export const productCategoryCodes = ["BATTERY", "PARTS", "EASY_BIKE_RICKSHAW"];
export function orderProductCategories<T extends { code: string }>(
  categories: T[],
) {
  return [...categories].sort(
    (first, second) =>
      productCategoryCodes.indexOf(first.code) -
      productCategoryCodes.indexOf(second.code),
  );
}
