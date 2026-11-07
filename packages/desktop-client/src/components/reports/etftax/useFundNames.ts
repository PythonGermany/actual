import type { TagEntity } from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import { tagQueries } from '#tags/queries';

const EMPTY_TAGS: TagEntity[] = [];

/**
 * Fund names from the descriptions of the ISIN tags (e.g. the tag
 * "IE00EXAMPLE1" described as "World Equity UCITS ETF"). Hidden tags count
 * too; returns null for an ISIN without a tag or description.
 */
export function useFundNames(): (isin: string) => string | null {
  // Not useTags(): it leaves out hidden tags, whose names should still show.
  const tags = useQuery(tagQueries.list()).data ?? EMPTY_TAGS;
  const names = new Map<string, string>();
  for (const tag of tags) {
    const description = tag.description?.trim();
    if (description) {
      names.set(tag.tag.toUpperCase(), description);
    }
  }
  return isin => names.get(isin.toUpperCase()) ?? null;
}
