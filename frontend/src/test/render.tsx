// test/render.tsx — render a component for a test INSIDE MantineProvider.
//
// Mantine components throw without a provider above them, so component tests import `renderWithMantine`
// from here instead of `render` from @testing-library/react. env="test" switches off transitions and
// portals' delays, so a dropdown is in the DOM as soon as it opens.

import { MantineProvider } from '@mantine/core'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { theme } from '../theme'

export function renderWithMantine(ui: ReactNode) {
  return render(<>{ui}</>, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MantineProvider theme={theme} env="test">
        {children}
      </MantineProvider>
    ),
  })
}
