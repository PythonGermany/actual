import { useParams } from 'react-router';

import type { EtfTaxWidget } from '@actual-app/core/types/models';

import { LoadingIndicator } from '#components/reports/LoadingIndicator';
import { useDashboardWidget } from '#hooks/useDashboardWidget';

import { GermanEtfTaxReport } from './GermanEtfTaxReport';

/** Route entry for /reports/german-etf-tax[/:id]: loads the widget, then mounts the report. */
export function GermanEtfTax() {
  const params = useParams();
  const { data: widget, isLoading } = useDashboardWidget<EtfTaxWidget>({
    id: params.id,
    type: 'etf-tax-card',
  });

  if (isLoading) {
    return <LoadingIndicator />;
  }
  return <GermanEtfTaxReport key={widget?.id ?? 'unsaved'} widget={widget} />;
}
