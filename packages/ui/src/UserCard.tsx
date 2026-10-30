// The signed-in person at the foot of the dark sidebar. The whole card is the trigger of the
// account menu, which opens upwards across the card's width.

import { Avatar } from './Avatar';
import type { AvatarTone } from './Avatar';
import { Chip } from './Chip';
import { ChevronDownIcon } from './Icon';
import { Menu } from './Menu';
import type { MenuEntry } from './Menu';
import './user-card.css';

export interface UserCardProps {
  name: string;
  /** Email, or role text. */
  detail: string;
  /** Avatar colour by role. Default: `learner`. */
  tone?: AvatarTone | undefined;
  /** The person's photo; the avatar shows it over the initials. */
  photoUrl?: string | null | undefined;
  /** The person's role in their label set: a chip in the menu's header, under name and email. */
  roleLabel?: string | undefined;
  items: MenuEntry[];
  /**
   * Names the menu: the trigger reads "<menuLabel>: <name> <detail>", the prefix visually hidden
   * so the accessible name starts with what is shown. Default: "Account".
   */
  menuLabel?: string;
}

export function UserCard({
  name,
  detail,
  tone,
  photoUrl,
  roleLabel,
  items,
  menuLabel = 'Account',
}: UserCardProps) {
  return (
    <Menu
      className="g-user-card"
      triggerClassName="g-user-card__trigger"
      placement="top"
      align="start"
      items={items}
      header={
        roleLabel ? (
          <>
            <span className="g-user-card__head-name">{name}</span>
            <span className="g-user-card__head-detail">{detail}</span>
            <Chip tone={tone === undefined || tone === 'learner' ? 'neutral' : 'accent'}>
              {roleLabel}
            </Chip>
          </>
        ) : undefined
      }
      trigger={
        <>
          <Avatar name={name} tone={tone} photoUrl={photoUrl} size={36} />
          <span className="g-user-card__text">
            <span className="g-user-card__name">
              <span className="g-user-card__hidden">{`${menuLabel}:`}</span> {name}
            </span>{' '}
            <span className="g-user-card__detail">{detail}</span>
          </span>
          <ChevronDownIcon className="g-user-card__chevron" />
        </>
      }
    />
  );
}
