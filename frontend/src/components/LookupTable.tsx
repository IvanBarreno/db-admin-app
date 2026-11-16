import { Alert, Button, Group, Loader, Paper, Skeleton, Table, Text, TextInput } from '@mantine/core'
import { IconDownload, IconSearch } from '@tabler/icons-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useLookup, type LookupItem } from '../api/lookups'
import { downloadCsv, toCsv } from './csv'
import { formatCell } from './lookupText'

type SortState = { column: string; descending: boolean } | null

/** Value of one column of a row: the synthetic "name" column is the lookup's `value`, the rest are its extras. */
function cell(item: LookupItem, column: string): unknown {
  return column === 'name' ? item.value : (item.extra as Record<string, unknown>)[column]
}

/**
 * Any lookup as a table: searchable, sortable by clicking a header, with the row count and a CSV export.
 * It shows exactly what the server answered (first column = the lookup's `value`, then every extra column), so
 * a new lookup in `lookups/*.yaml` becomes browsable with no frontend change.
 */
export function LookupTable({
  serverName,
  lookupId,
  database = '',
  args = {},
  filter,
  title,
  emptyText = 'Nothing to list.',
  rowAction,
}: {
  /** Extra last cell per row (e.g. the Explorer's "Use in operation" menu). Omit it for a plain table. */
  rowAction?: (item: LookupItem) => ReactNode
  serverName: string
  lookupId: string
  /** Database for database-scoped lookups. */
  database?: string
  /** Lookup arguments, e.g. `{ login_name: 'zz_leaver' }`. */
  args?: Record<string, string>
  /** Keeps only some rows (e.g. the roles a login is a member of). */
  filter?: (item: LookupItem) => boolean
  title?: string
  emptyText?: string
}) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState>(null)

  const query = useLookup(serverName, lookupId, { database, args })
  const warning = query.data?.warning ?? null

  const items = useMemo(() => {
    const all = query.data?.items ?? []
    return filter ? all.filter(filter) : all
  }, [query.data, filter])

  // Columns: the value, then the extra columns in the order the server returned them.
  const columns = useMemo(() => {
    const names = new Set<string>()
    for (const item of items) for (const key of Object.keys(item.extra)) names.add(key)
    return ['name', ...names]
  }, [items])

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const shown = needle
      ? items.filter((item) => columns.some((c) => formatCell(cell(item, c)).toLowerCase().includes(needle)))
      : [...items]
    if (sort) {
      shown.sort((a, b) => {
        const x = cell(a, sort.column)
        const y = cell(b, sort.column)
        const order =
          typeof x === 'number' && typeof y === 'number' ? x - y : formatCell(x).localeCompare(formatCell(y), undefined, { numeric: true })
        return sort.descending ? -order : order
      })
    }
    return shown
  }, [items, columns, search, sort])

  function exportCsv() {
    // The rows as shown (current search and sort), with the same cell text as the table.
    downloadCsv(lookupId, toCsv(columns, rows.map((item) => columns.map((c) => formatCell(cell(item, c))))))
  }

  function toggleSort(column: string) {
    setSort((current) => (current?.column === column ? (current.descending ? null : { column, descending: true }) : { column, descending: false }))
  }

  const ready = query.isSuccess && !warning

  return (
    <Paper withBorder>
      <Group gap="sm" px="sm" py={8} wrap="wrap" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        {title && (
          <Text size="sm" fw={600}>
            {title}
          </Text>
        )}
        {ready && (
          <>
            <Text size="xs" c="dimmed">
              {rows.length === items.length ? `${items.length} rows` : `${rows.length} of ${items.length} rows`}
            </Text>
            <TextInput
              size="xs"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder="search…"
              leftSection={<IconSearch size={14} />}
              aria-label="Search the table"
            />
            <Button ml="auto" size="compact-xs" variant="default" leftSection={<IconDownload size={14} />} onClick={exportCsv} disabled={rows.length === 0}>
              Export CSV
            </Button>
          </>
        )}
      </Group>

      {query.isPending && query.fetchStatus !== 'idle' && (
        <Group gap="xs" p="sm">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            Loading…
          </Text>
        </Group>
      )}
      {query.isPending && query.fetchStatus === 'idle' && <Skeleton height={0} />}
      {query.isError && (
        <Alert color="red" variant="light" m="xs">
          {query.error.message}
        </Alert>
      )}
      {warning && (
        <Alert color="yellow" variant="light" m="xs">
          {warning}
        </Alert>
      )}
      {ready && items.length === 0 && (
        <Text size="sm" c="dimmed" p="sm">
          {emptyText}
        </Text>
      )}

      {ready && items.length > 0 && (
        <Table.ScrollContainer minWidth={400} maxHeight={448} type="native">
          <Table stickyHeader highlightOnHover fz="sm" verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr>
                {columns.map((c) => (
                  <Table.Th key={c} onClick={() => toggleSort(c)} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {c.replaceAll('_', ' ')}
                    {sort?.column === c && (sort.descending ? ' ▼' : ' ▲')}
                  </Table.Th>
                ))}
                {rowAction && <Table.Th />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((item) => (
                <Table.Tr key={item.value}>
                  {columns.map((c) => (
                    <Table.Td key={c} ff={c === 'name' ? 'monospace' : undefined} fz={c === 'name' ? 'xs' : undefined} style={{ whiteSpace: 'nowrap' }}>
                      {formatCell(cell(item, c))}
                    </Table.Td>
                  ))}
                  {rowAction && (
                    <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                      {rowAction(item)}
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Paper>
  )
}
