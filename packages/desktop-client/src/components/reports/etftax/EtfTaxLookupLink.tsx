import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { Link } from '#components/common/Link';

import { isinUrl, lookupSite } from './etftax';

type EtfTaxLookupLinkProps = {
  isin: string;
  /** Quote page URL with an {isin} placeholder; no link without one. */
  template?: string;
};

/** External link icon that opens the fund's quote page in a new tab. */
export function EtfTaxLookupLink({ isin, template }: EtfTaxLookupLinkProps) {
  const { t } = useTranslation();
  const url = isinUrl(isin, template);
  if (url === null) {
    return null;
  }
  const site = lookupSite(url);
  const label = site ? t('Look up on {{site}}', { site }) : t('Look up');
  return (
    <Link variant="external" to={url} linkColor="muted">
      <View
        title={label}
        aria-label={label}
        style={{
          color: theme.pageTextSubdued,
          ':hover': { color: theme.pageTextLink },
        }}
      >
        {/* The usual external link icon (box with an arrow leaving it); the
            icon library has none. */}
        <svg
          aria-hidden
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 3h7v7" />
          <path d="M21 3 11 13" />
          <path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
        </svg>
      </View>
    </Link>
  );
}
