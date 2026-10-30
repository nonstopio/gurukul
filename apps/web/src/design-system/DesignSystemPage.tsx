import { Page, PageHeader } from '@gurukul/ui';
import { useTerms } from '../labels/useTerms';
import { DesignSystem } from './DesignSystem';

/** `/admin/design-system`: the live tokens and components, its own Admin page beside Org settings. */
export function DesignSystemPage() {
  const t = useTerms();
  return (
    <Page>
      <PageHeader
        eyebrow={t.Admin}
        title="Design system"
        lead="The real tokens and components this app is built from."
      />
      <DesignSystem />
    </Page>
  );
}
