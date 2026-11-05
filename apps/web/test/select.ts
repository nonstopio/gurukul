import { fireEvent, within } from '@testing-library/react';

/** Chooses an option in a `Select` as a person does: open the list, click the option by its name. */
export function choose(combobox: HTMLElement, option: string | RegExp) {
  fireEvent.click(combobox);
  const list = document.getElementById(String(combobox.getAttribute('aria-controls')));
  fireEvent.click(within(list as HTMLElement).getByRole('option', { name: option }));
}

/** The names of a `Select`'s options, read by opening its list and closing it again. */
export function optionNames(combobox: HTMLElement) {
  fireEvent.click(combobox);
  const list = document.getElementById(String(combobox.getAttribute('aria-controls')));
  const names = within(list as HTMLElement)
    .getAllByRole('option')
    .map((o) => o.textContent);
  fireEvent.click(combobox);
  return names;
}
