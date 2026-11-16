import { Badge } from '@mantine/core'
import { ENVIRONMENT_COLOR, type ServerEnvironment } from '../theme'

/**
 * Small pill showing a server's environment. Production is red on purpose — the plan calls
 * for it to be impossible to forget which server you're pointed at. The colours come from the theme
 * (ENVIRONMENT_COLOR), so the badge, the target bar and the confirm dialogs always agree.
 */
export function EnvBadge({ environment }: { environment: ServerEnvironment }) {
  return (
    // Production is filled (loud); the others use the quieter "light" variant.
    <Badge color={ENVIRONMENT_COLOR[environment]} variant={environment === 'Production' ? 'filled' : 'light'} radius="sm">
      {environment}
    </Badge>
  )
}
