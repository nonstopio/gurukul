import { PeoplePicker } from '@gurukul/ui';
import type { EmailClassification, Person } from '@gurukul/ui';
import { useState } from 'react';
import type { ConsoleData } from './types';
import { usePeopleLookup } from './usePeopleSearch';

/**
 * The people field every console screen uses (assign, team members): a Jira-style typeahead with
 * photos, over everyone who has signed in, that also takes an email for someone who has not. The
 * page keeps plain emails; this remembers the names and photos of the people picked so the chips
 * show them.
 */
export function PeopleField({
  data,
  label,
  emails,
  onEmails,
  classify,
  statusWords,
  placeholder,
  describedBy,
}: {
  data: Pick<ConsoleData, 'searchUsers' | 'usersPage' | 'userCount'>;
  label: string;
  emails: string[];
  onEmails: (emails: string[]) => void;
  /** What each chip means in words; omit for none. */
  classify?: (email: string) => EmailClassification | null;
  statusWords?: Partial<Record<EmailClassification['status'], string>>;
  placeholder?: string;
  describedBy?: string;
}) {
  const { search, total } = usePeopleLookup(data);
  // Who has been picked or listed so far, by email, for their name and photo on a chip.
  const [known, setKnown] = useState<Record<string, Person>>({});
  const remember = (people: Person[]) =>
    setKnown((k) => ({ ...k, ...Object.fromEntries(people.map((p) => [p.email, p])) }));
  const value = emails.map((email) => known[email] ?? { email });
  return (
    <PeoplePicker
      label={label}
      value={value}
      search={async (text) => {
        const found = await search(text);
        remember(found);
        return found;
      }}
      onChange={(people) => {
        remember(people);
        onEmails(people.map((p) => p.email));
      }}
      allowEmails
      total={total}
      classify={classify}
      statusWords={statusWords}
      placeholder={placeholder}
      describedBy={describedBy}
    />
  );
}
