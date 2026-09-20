import type { TranslationKey } from "./i18n";

export type T = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;
