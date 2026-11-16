// theme.ts — the one place that decides how the app looks. MantineProvider (main.tsx) receives this object
// and every Mantine component reads its colours, radius, fonts and default props from it.
//
// Rule of thumb: a visual decision that should hold everywhere goes HERE (or in a component's default
// props below), never as a one-off prop repeated on forty buttons.

import { createTheme, type MantineColor } from '@mantine/core'
import type { ServerSummary } from './api/servers'

export type ServerEnvironment = ServerSummary['environment']

/**
 * Colour of each server environment, as a Mantine colour name. Production is red on purpose: the plan
 * calls for it to be impossible to forget which server you are pointed at. Used by the environment badge,
 * the target bar and the confirm dialogs, so the three always agree.
 */
export const ENVIRONMENT_COLOR: Record<ServerEnvironment, MantineColor> = {
  Production: 'red',
  Test: 'yellow',
  Development: 'blue',
}

/** Height of the top bar in px; the sticky target bar sits right below it. */
export const HEADER_HEIGHT = 56

export const theme = createTheme({
  primaryColor: 'blue',
  // Mantine 9 rounds corners with "md" (8px) by default; "sm" (4px) suits a dense admin tool better.
  defaultRadius: 'sm',
  // System fonts: an internal tool should not download web fonts.
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  headings: { fontWeight: '600' },

  // Default props per component: the app-wide answer to "how do our inputs / buttons look?".
  components: {
    // Compact controls everywhere: operation forms have many fields and the DBA wants them on one screen.
    TextInput: { defaultProps: { size: 'sm' } },
    PasswordInput: { defaultProps: { size: 'sm' } },
    NumberInput: { defaultProps: { size: 'sm' } },
    Select: { defaultProps: { size: 'sm' } },
    Textarea: { defaultProps: { size: 'sm' } },
    Button: { defaultProps: { size: 'sm' } },
    // Tooltips appear after a short delay so they do not flicker while the mouse crosses the page.
    Tooltip: { defaultProps: { openDelay: 300, withArrow: true } },
  },
})
