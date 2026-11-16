import { Button, Dialog, Input, useToast } from '@gurukul/ui';
import { useState } from 'react';
import { toastError } from '../errors';
import { dayInput, endOfDay } from '../team/model';
import { useConsole } from './ConsoleProvider';
import { dueDay } from './model';

/** The assignment a dialog acts on, in words a person reads. `dueAt` in epoch milliseconds. */
export interface AssignmentTarget {
  assignmentId: string;
  courseTitle: string;
  dueAt: number | null;
  /** Whose assignment it is: their name, or their email until they have signed in. */
  name: string;
}

/** Today as a date field holds it, in the viewer's time zone. */
const today = () => dayInput(Date.now());

/**
 * A new due date for one assignment, or none, through `updateAssignment`. A date in the past is
 * refused here and by the function. Used by the team report and the learner drawer.
 */
export function DueDateDialog({
  target,
  onClose,
  onSaved,
}: {
  target: AssignmentTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { service } = useConsole();
  const toast = useToast();
  const [due, setDue] = useState(target.dueAt === null ? '' : dayInput(target.dueAt));
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (due && due < today()) return setError('The due date cannot be in the past.');
    setSaving(true);
    try {
      const dueAt = due ? endOfDay(due) : null;
      await service.updateAssignment({ assignmentId: target.assignmentId, dueAt });
      toast.show(
        dueAt === null
          ? `${target.courseTitle} has no due date now`
          : `${target.courseTitle} is due ${dueDay(dueAt)}`,
        { tone: 'success' },
      );
      onSaved();
    } catch (e) {
      toastError(toast, e, 'Could not change the due date. Try again.');
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Change due date"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            Save due date
          </Button>
        </>
      }
    >
      <p>
        <strong>{target.courseTitle}</strong> for {target.name}
      </p>
      <Input
        label="Due date"
        type="date"
        min={today()}
        value={due}
        error={error}
        hint="Leave it empty for no due date. A new date gets its own reminder before it and after it passes."
        onChange={(e) => setDue(e.target.value)}
      />
    </Dialog>
  );
}

/**
 * Asks before taking a course off one person's list, through `removeAssignment`. It stays open
 * when the call fails. Used by the team report and the learner drawer.
 */
export function RemoveAssignmentDialog({
  target,
  onClose,
  onRemoved,
}: {
  target: AssignmentTarget;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const { service } = useConsole();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await service.removeAssignment({ assignmentId: target.assignmentId });
      toast.show(`Removed ${target.courseTitle} from ${target.name}`, { tone: 'success' });
      onRemoved();
    } catch (e) {
      toastError(toast, e, 'Could not remove the course. Try again.');
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Remove ${target.courseTitle}?`}
      mascot="warning"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void remove()}>
            Remove course
          </Button>
        </>
      }
    >
      <p>
        {`${target.name} no longer has to take it, and gets no more reminders about it. Their progress so far, and any certificate, is kept.`}
      </p>
    </Dialog>
  );
}
