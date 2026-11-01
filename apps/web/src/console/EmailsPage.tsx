import { Button, Card, Page, PageHeader, Select, useToast } from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { userMessageOf } from '../api';
import { useUser } from '../auth/AuthProvider';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { useConsole } from './ConsoleProvider';
import { PeopleField } from './PeopleField';
import type { EmailTemplateView } from './types';

/** `/admin/emails`: every email Gurukul sends, and a form to send one to up to two people as a test. */
export function EmailsPage() {
  const { service } = useConsole();
  const t = useTerms();
  const result = useAsync(useCallback(() => service.listEmailTemplates(), [service]));
  return (
    <Page>
      <PageHeader
        eyebrow={t.Admin}
        title="Email templates"
        lead="Every email Gurukul sends, filled with sample data."
      />
      <Loaded loadable={result}>{(templates) => <Templates templates={templates} />}</Loaded>
    </Page>
  );
}

function Templates({ templates }: { templates: EmailTemplateView[] }) {
  const { data, service } = useConsole();
  const toast = useToast();
  const [id, setId] = useState((templates[0] as EmailTemplateView).id);
  const me = useUser();
  const [first, setFirst] = useState(me.email as string);
  const [second, setSecond] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const [sending, setSending] = useState(false);

  const send = async () => {
    const recipients = [first, second].map((v) => v.trim()).filter((v) => v !== '');
    if (recipients.length === 0) return setProblem('Enter at least one email address.');
    if (!recipients.every((v) => v.toLowerCase().endsWith('@nonstopio.com'))) {
      return setProblem('Use @nonstopio.com addresses.');
    }
    setProblem(undefined);
    setSending(true);
    try {
      const { to } = await service.sendTestEmail({ templateId: id, recipients });
      toast.show(`Test email sent to ${to.join(' and ')}`, { tone: 'success' });
    } catch (e) {
      log.error('Sending a test email failed', e, { templateId: id });
      toast.show(userMessageOf(e, 'Could not send the test email. Try again.'), {
        tone: 'danger',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="emails">
      <Card title="Send a test email">
        <p>Sends the chosen template, with sample data, to one or two NonStop io addresses.</p>
        <div className="emails-send">
          <Select label="Template" value={id} onChange={(e) => setId(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <PeopleField
            data={data}
            label="First email address"
            emails={first ? [first] : []}
            onEmails={(e) => setFirst(e[e.length - 1] ?? '')}
            {...(problem ? { describedBy: 'emails-problem' } : {})}
          />
          <PeopleField
            data={data}
            label="Second email address (optional)"
            emails={second ? [second] : []}
            onEmails={(e) => setSecond(e[e.length - 1] ?? '')}
          />
          {problem ? (
            <p id="emails-problem" role="alert" className="emails-problem">
              {problem}
            </p>
          ) : null}
          <div>
            <Button loading={sending} onClick={() => void send()}>
              Send test email
            </Button>
          </div>
        </div>
      </Card>
      {templates.map((t) => (
        <Card key={t.id} title={t.name}>
          <p>{t.when}</p>
          <p>
            <strong>Subject:</strong> {t.subject}
          </p>
          <pre className="emails-body">{t.body}</pre>
        </Card>
      ))}
    </div>
  );
}
