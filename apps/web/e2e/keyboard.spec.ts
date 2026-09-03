import { expect, test } from '@playwright/test';
import { Walk, openAtRest } from './walk';

/**
 * The keyboard pass R-23 deferred to here.
 *
 * R-23 landed the behaviour — a tab order following the job, visible focus,
 * arrows nudging a numeric field, Escape closing a popover, and a keyboard
 * route to everything the 3D view can do by clicking — and said plainly that
 * it was walked by hand because there was nothing to assert it in. These are
 * the parts that need a real browser: `useDialog`'s focus trap filters on
 * whether an element has a client rectangle, and jsdom gives everything an
 * empty one, so under it every dialog looks like a dialog with nothing
 * focusable in it.
 */

const focused = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    return {
      name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
      inDialog: el.closest('[role="dialog"]') !== null,
      tag: el.tagName,
    };
  });

test('nudges a numeric field with the arrow keys', async ({ page }) => {
  await openAtRest(page);
  await page.locator('.carc-tab').filter({ hasText: 'Base' }).click();

  const width = page
    .getByLabel('Inspector')
    .getByRole('spinbutton', { name: 'Width', exact: true });
  await width.focus();
  await expect(width).toHaveValue('900');
  await page.keyboard.press('ArrowUp');
  await expect(width).toHaveValue('901');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(width).toHaveValue('899');

  const walk = new Walk(page);
  expect((await walk.params()).cabinets[0]!.carcasses[0]!.width).toBe(899);
});

test('holds Tab inside a modal and gives the keyboard back on the way out', async ({ page }) => {
  await openAtRest(page);
  const opener = page.getByRole('button', { name: 'At the machine' });
  await opener.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'At the machine' });
  await expect(dialog).toBeVisible();
  await expect.poll(async () => (await focused(page))?.inDialog).toBe(true);

  // Twenty stops is well past the header; a trap that leaks shows up as focus
  // on the bench behind it, which is both a screen-reader trap and a way to
  // change a parameter you cannot see.
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    expect(await focused(page)).toMatchObject({ inDialog: true });
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

/**
 * The diagnostics list is the one overlay that deliberately is *not* modal.
 *
 * It docks along the bottom so the cabinet stays workable with the list open
 * — the whole point of moving it out of the permanent quarter-window panel
 * R-16 measured — so Tab reaching the bench behind it is the design, not a
 * leak. It carries no `aria-modal` for the same reason.
 */
test('docks the diagnostics list without trapping the keyboard in it', async ({ page }) => {
  await openAtRest(page);
  const chip = page.getByRole('button', { name: /blocking/ });
  await chip.focus();
  await page.keyboard.press('Enter');

  const sheet = page.getByRole('dialog', { name: 'Diagnostics' });
  await expect(sheet).toBeVisible();
  await expect(sheet).not.toHaveAttribute('aria-modal', 'true');

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  // Escape leaves the keyboard on the chip it was opened from, rather than
  // dropping it at the top of the document.
  await expect(chip).toBeFocused();
});

test('reaches every setting by name, and lands the keyboard on the control', async ({ page }) => {
  await openAtRest(page);
  await page.keyboard.press('Control+k');

  const palette = page.getByRole('dialog', { name: 'Find a setting' });
  await expect(palette).toBeVisible();
  await page.keyboard.type('kickboard');
  await page.keyboard.press('Enter');

  await expect(palette).toHaveCount(0);
  // Not merely the right panel: the keyboard is on the control itself, which
  // is the whole difference between find-by-name and a table of contents.
  await expect(
    page.getByLabel('Inspector').getByRole('checkbox', { name: 'Toe kick' }),
  ).toBeFocused();
});

test('works the run strip and the bay galleries without a mouse', async ({ page }) => {
  await openAtRest(page);
  const walk = new Walk(page);

  // Everything the 3D view can do by clicking has a keyboard route: the run
  // strip is that route to a bay, which has no geometry of its own to click.
  await page.getByRole('button', { name: 'Base, bay 1' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Inspector')).toContainText('Bay 1');

  const drawers = page.getByRole('button', { name: /^Drawers/ });
  await drawers.focus();
  await page.keyboard.press('Enter');
  expect((await walk.params()).cabinets[0]!.carcasses[0]!.bays[0]!.drawerFrontHeights.length).toBe(
    3,
  );
});

test('opens the explanation behind a field without a pointer to hover with', async ({ page }) => {
  await openAtRest(page);
  // F-10: a hover tooltip does not exist on a tablet at the machine, and
  // fires on nothing for a keyboard. Every explanation is behind a button.
  const info = page.getByLabel('Inspector').getByRole('button', { name: 'What this does' }).first();
  await info.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tooltip')).toBeVisible();
});
