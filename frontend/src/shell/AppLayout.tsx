import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Burger,
  Group,
  NavLink,
  Title,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { useDisclosure, useLocalStorage, useMediaQuery } from '@mantine/hooks'
import {
  IconBook,
  IconCompass,
  IconDatabaseCog,
  IconHistory,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMoon,
  IconServer,
  IconSun,
  IconTerminal2,
  IconTool,
  IconUserOff,
} from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { usePing } from '../api/ping'
import { HEADER_HEIGHT } from '../theme'
import { AppFooter } from './AppFooter'

/** The pages of the app, in sidebar order. Adding a page = one line here + one <Route> in App.tsx. */
const PAGES = [
  { to: '/', label: 'Servers', icon: IconServer },
  { to: '/explorer', label: 'Explorer', icon: IconCompass },
  { to: '/operations', label: 'Operations', icon: IconTool },
  { to: '/offboarding', label: 'Offboarding', icon: IconUserOff },
  { to: '/sql', label: 'Custom SQL', icon: IconTerminal2 },
  { to: '/audit', label: 'Audit log', icon: IconHistory },
  { to: '/docs', label: 'Documentation', icon: IconBook },
] as const

const NAV_WIDTH = 220
const NAV_WIDTH_COLLAPSED = 64

/**
 * Application shell (Mantine AppShell): a fixed top bar, a sidebar with the pages, and the current page in
 * the main area. AppShell does the layout maths for us — it reserves the space of the header and the navbar
 * so the page content never slides under them, and turns the sidebar into a slide-in menu on narrow windows.
 *
 * Two independent "is the sidebar open?" states, because they answer different questions:
 *   - narrow window: `mobileOpened` — the menu is an overlay opened with the burger, closed again on navigation;
 *   - wide window:   `collapsed`   — the sidebar shrinks to icons to give the tables more room, and the choice
 *                                    is remembered in this browser (localStorage).
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false)
  // useLocalStorage works like useState but also writes the value to localStorage, so it survives a reload.
  const [collapsed, setCollapsed] = useLocalStorage({ key: 'sqladmin-nav-collapsed', defaultValue: false })
  // Same width as AppShell's `breakpoint: 'sm'` (48em): below it the sidebar is the full-width mobile menu,
  // where icon-only links would make no sense.
  const isNarrow = useMediaQuery('(max-width: 48em)') ?? false
  const iconsOnly = collapsed && !isNarrow

  const { pathname } = useLocation()
  // "/" must match exactly (every path starts with "/"); the others also match their sub-paths.
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`))

  return (
    <AppShell
      header={{ height: HEADER_HEIGHT }}
      navbar={{
        width: collapsed ? NAV_WIDTH_COLLAPSED : NAV_WIDTH,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            {/* hiddenFrom="sm": the burger only exists on narrow windows. */}
            <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" aria-label="Open the navigation menu" />
            <IconDatabaseCog size={24} stroke={1.6} aria-hidden />
            {/* order={1} = an <h1> for screen readers and search; size="h4" = looks like a small heading. */}
            <Title order={1} size="h4" style={{ whiteSpace: 'nowrap' }}>
              SQL Admin Console
            </Title>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <ApiStatusBadge />
            <ColorSchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {/* grow: this section takes all the free height, pushing the collapse button to the bottom. */}
        <AppShell.Section grow component="nav" aria-label="Pages">
          {PAGES.map((page) => {
            const Icon = page.icon
            return (
              // Icons-only mode: the label moves into a tooltip so the page is still named on hover.
              <Tooltip key={page.to} label={page.label} position="right" disabled={!iconsOnly}>
                {/* Mantine's NavLink draws the item; component={Link} makes it a react-router link, so a
                    click changes the URL without reloading the page. */}
                <NavLink
                  component={Link}
                  to={page.to}
                  label={iconsOnly ? undefined : page.label}
                  aria-label={page.label}
                  leftSection={<Icon size={20} stroke={1.6} />}
                  active={isActive(page.to)}
                  onClick={closeMobile}
                  style={{ borderRadius: 'var(--mantine-radius-sm)' }}
                />
              </Tooltip>
            )
          })}
        </AppShell.Section>

        {/* visibleFrom="sm": collapsing to icons is a wide-window feature. */}
        <AppShell.Section visibleFrom="sm">
          <Tooltip label={collapsed ? 'Show the page names' : 'Collapse to icons'} position="right">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
            >
              {collapsed ? <IconLayoutSidebarLeftExpand size={20} stroke={1.6} /> : <IconLayoutSidebarLeftCollapse size={20} stroke={1.6} />}
            </ActionIcon>
          </Tooltip>
        </AppShell.Section>
      </AppShell.Navbar>

      {/* Main is a column: the page takes the free height (flex: 1), so the footer sits at the bottom of the
          window on short pages and after the content on long ones. */}
      <AppShell.Main style={{ display: 'flex', flexDirection: 'column' }}>
        {/* A maximum width keeps forms and text readable on very wide monitors. */}
        <Box maw={1400} w="100%" mx="auto" style={{ flex: 1 }}>
          {children}
        </Box>
        <Box maw={1400} w="100%" mx="auto">
          <AppFooter />
        </Box>
      </AppShell.Main>
    </AppShell>
  )
}

/** Green when the API answers, red when it doesn't, grey while checking. The details are in the tooltip. */
function ApiStatusBadge() {
  const ping = usePing()
  const state = ping.isPending ? 'checking' : ping.isError ? 'down' : 'up'
  const detail = ping.data ? `${ping.data.environment} · v${ping.data.version}` : ping.error?.message

  const color = { checking: 'gray', up: 'green', down: 'red' }[state]
  const label = { checking: 'Checking API…', up: 'API online', down: 'API offline' }[state]

  return (
    <Tooltip label={detail} disabled={!detail}>
      {/* variant="dot": a small coloured dot before the text, quieter than a filled badge. */}
      <Badge variant="dot" color={color} size="lg" tt="none" fw={500}>
        {label}
      </Badge>
    </Tooltip>
  )
}

/**
 * Light / dark switch. The stored preference may be "auto" (follow the operating system), so the button
 * looks at the scheme that is actually SHOWN (`useComputedColorScheme` → 'light' | 'dark') and sets the
 * opposite one. Mantine saves the choice in localStorage.
 */
function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme()
  const shown = useComputedColorScheme('light')
  const next = shown === 'light' ? 'dark' : 'light'

  return (
    <Tooltip label={`Switch to ${next} mode`}>
      <ActionIcon variant="default" size="lg" onClick={() => setColorScheme(next)} aria-label={`Switch to ${next} mode`}>
        {shown === 'light' ? <IconMoon size={18} stroke={1.6} /> : <IconSun size={18} stroke={1.6} />}
      </ActionIcon>
    </Tooltip>
  )
}
