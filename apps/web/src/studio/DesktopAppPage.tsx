import { Page, PageHeader } from '@gurukul/ui';
import { useTerms } from '../labels/useTerms';
import { DesktopDownloadCard } from './DesktopDownloadCard';

/** `/studio/desktop`: where an Educator gets the Gurukul Studio desktop app (`.plan/22-desktop-studio.md`, Download). */
export function DesktopAppPage() {
  const t = useTerms();
  return (
    <Page width="wide">
      <PageHeader
        eyebrow={t.Studio}
        title="Desktop app"
        lead="Build or edit a course by chatting with an AI on your own computer."
      />
      <DesktopDownloadCard />
    </Page>
  );
}
