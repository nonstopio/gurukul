import { Button, Card, Input, Page, PageHeader, ToggleCard, useToast } from '@gurukul/ui';
import {
  DEFAULT_UPLOAD_LIMITS,
  UPLOAD_HARD_CEILING_KB,
  UPLOAD_MIN_LIMIT_KB,
  uploadLimitsSchema,
} from '@gurukul/schema';
import type { OrgConfig, UploadLimits } from '@gurukul/schema';
import { useCallback, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useAsync } from '../data/useAsync';
import { log } from '../log';
import { Loaded } from '../learn/ui';
import { useTerms } from '../labels/useTerms';
import { useConsole } from './ConsoleProvider';

/**
 * `/admin/settings`: the daily reminders, the certificate
 * signatory and the upload limits. The design system used to be a tab here; its old `?tab=design-system` links land on
 * `/admin/design-system`.
 */
export function SettingsPage() {
  const { data } = useConsole();
  const t = useTerms();
  const result = useAsync(useCallback(() => data.orgSettings(), [data]));
  const [params] = useSearchParams();
  if (params.get('tab') === 'design-system') {
    const section = params.get('section');
    const search = section ? `?${new URLSearchParams({ section })}` : '';
    return <Navigate replace to={{ pathname: '/admin/design-system', search }} />;
  }

  return (
    <Page>
      <PageHeader eyebrow={t.Admin} title="Org settings" />
      <Loaded loadable={result}>{(saved) => <SettingsForm saved={saved} />}</Loaded>
    </Page>
  );
}

/** What is wrong with one limit as typed, in words an Admin can act on; `null` when it is valid. */
function limitError(text: string): string | null {
  const value = text.trim() === '' ? Number.NaN : Number(text);
  const result = uploadLimitsSchema.shape.imageMaxKB.safeParse(value);
  if (result.success) return null;
  const code = result.error.issues[0]?.code;
  if (code === 'too_small') return `Enter at least ${UPLOAD_MIN_LIMIT_KB} KB.`;
  if (code === 'too_big') return `Enter at most ${UPLOAD_HARD_CEILING_KB} KB, the hard ceiling.`;
  return 'Enter a whole number of KB.';
}

function SettingsForm({ saved: initial }: { saved: OrgConfig }) {
  const { data } = useConsole();
  const terms = useTerms();
  const toast = useToast();
  const [saved, setSaved] = useState(initial);
  const [reminders, setReminders] = useState(initial.reminders.enabled);
  const [signName, setSignName] = useState(initial.signatory.name);
  const [signRole, setSignRole] = useState(initial.signatory.role);
  const savedLimits: UploadLimits = initial.uploads ?? DEFAULT_UPLOAD_LIMITS;
  const [imageKB, setImageKB] = useState(String(savedLimits.imageMaxKB));
  const [pdfKB, setPdfKB] = useState(String(savedLimits.pdfMaxKB));
  const [saving, setSaving] = useState(false);
  const signatory = { name: signName.trim(), role: signRole.trim() };
  const signatoryValid = signatory.name !== '' && signatory.role !== '';
  const imageError = limitError(imageKB);
  const pdfError = limitError(pdfKB);
  const uploadsValid = imageError === null && pdfError === null;
  const current = saved.uploads ?? DEFAULT_UPLOAD_LIMITS;
  const uploadsChanged =
    Number(imageKB) !== current.imageMaxKB || Number(pdfKB) !== current.pdfMaxKB;
  const dirty =
    reminders !== saved.reminders.enabled ||
    signatory.name !== saved.signatory.name ||
    signatory.role !== saved.signatory.role ||
    uploadsChanged;

  const save = async () => {
    // `uploads` rides along only when this form changed it: a form opened before another Admin
    // lowered a limit must not put the old number back, nor write limits nobody set.
    const settings: OrgConfig = {
      domain: saved.domain,
      teams: saved.teams,
      reminders: { enabled: reminders },
      signatory,
      ...(uploadsChanged
        ? {
            uploads: uploadLimitsSchema.parse({
              imageMaxKB: Number(imageKB),
              pdfMaxKB: Number(pdfKB),
            }),
          }
        : {}),
    };
    setSaving(true);
    try {
      await data.saveOrgSettings(settings);
      setSaved({ ...saved, ...settings });
      toast.show('Settings saved', { tone: 'success' });
    } catch (e) {
      log.error('Saving org settings failed', e, {});
      toast.show('Could not save the settings. Try again.', { tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings">
      <Card title="Daily reminders">
        <ToggleCard
          title="Send daily reminders"
          description={`A daily run at 04:00 UTC (09:30 in India) sends the reminders each mandatory course was assigned with, weekly or before it is due, as at most one email per person a day. Off, nobody is reminded automatically; you can still remind people from ${terms.Learners}.`}
          checked={reminders}
          onChange={(e) => setReminders(e.target.checked)}
        />
      </Card>

      <Card title="Certificate signatory">
        <p>
          The name and role printed at the foot of every certificate. A certificate keeps the
          signatory it was issued with, so changing this affects only certificates issued from now
          on.
        </p>
        <div className="settings-fields">
          <Input
            label="Signatory name"
            value={signName}
            maxLength={120}
            onChange={(e) => setSignName(e.target.value)}
          />
          <Input
            label="Signatory role"
            value={signRole}
            maxLength={120}
            onChange={(e) => setSignRole(e.target.value)}
          />
        </div>
        {signatoryValid ? null : <p role="alert">Enter both a name and a role to save.</p>}
      </Card>

      <Card title="Uploads">
        <p>
          The largest file an Educator may upload into a lesson. The defaults are{' '}
          {DEFAULT_UPLOAD_LIMITS.imageMaxKB} KB for an image and {DEFAULT_UPLOAD_LIMITS.pdfMaxKB} KB
          for a PDF, and nothing can go above {UPLOAD_HARD_CEILING_KB} KB, whatever is set here.
          Lowering a limit affects new uploads only: files already uploaded stay as they are.
        </p>
        <div className="settings-fields">
          <Input
            label="Largest image (KB)"
            type="number"
            inputMode="numeric"
            min={UPLOAD_MIN_LIMIT_KB}
            max={UPLOAD_HARD_CEILING_KB}
            step={1}
            hint={`Default ${DEFAULT_UPLOAD_LIMITS.imageMaxKB}. From ${UPLOAD_MIN_LIMIT_KB} to ${UPLOAD_HARD_CEILING_KB}.`}
            value={imageKB}
            error={imageError ?? undefined}
            onChange={(e) => setImageKB(e.target.value)}
          />
          <Input
            label="Largest PDF (KB)"
            type="number"
            inputMode="numeric"
            min={UPLOAD_MIN_LIMIT_KB}
            max={UPLOAD_HARD_CEILING_KB}
            step={1}
            hint={`Default ${DEFAULT_UPLOAD_LIMITS.pdfMaxKB}. From ${UPLOAD_MIN_LIMIT_KB} to ${UPLOAD_HARD_CEILING_KB}.`}
            value={pdfKB}
            error={pdfError ?? undefined}
            onChange={(e) => setPdfKB(e.target.value)}
          />
        </div>
      </Card>

      <div className="settings-actions">
        {dirty ? <p>You have unsaved changes.</p> : null}
        <Button
          loading={saving}
          disabled={!dirty || !signatoryValid || !uploadsValid}
          onClick={() => void save()}
        >
          Save settings
        </Button>
      </div>
    </div>
  );
}
