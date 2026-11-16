using Microsoft.EntityFrameworkCore;
using SqlAdmin.Core.Audit;

namespace SqlAdmin.Infrastructure.Audit;

public sealed class EfAuditStore(AuditDbContext db) : IAuditStore
{
    public async Task RecordAsync(AuditEntry entry, CancellationToken ct)
    {
        db.AuditLog.Add(entry);
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<AuditStep>> GetStepsAsync(long auditEntryId, CancellationToken ct) =>
        await db.Set<AuditStep>().AsNoTracking()
            .Where(s => s.AuditEntryId == auditEntryId)
            .OrderBy(s => s.StepNo)
            .ToListAsync(ct);

    public async Task<IReadOnlyDictionary<long, int>> GetStepCountsAsync(IReadOnlyCollection<long> auditEntryIds, CancellationToken ct)
    {
        if (auditEntryIds.Count == 0) return new Dictionary<long, int>();

        // One grouped query for the whole page (SELECT AuditEntryId, COUNT(*) ... GROUP BY AuditEntryId),
        // instead of one COUNT per row.
        return await db.Set<AuditStep>().AsNoTracking()
            .Where(s => auditEntryIds.Contains(s.AuditEntryId))
            .GroupBy(s => s.AuditEntryId)
            .Select(g => new { EntryId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.EntryId, x => x.Count, ct);
    }

    public async Task<IReadOnlyList<AuditEntry>> QueryAsync(AuditQuery query, CancellationToken ct)
    {
        var entries = db.AuditLog.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.ExecutedBy))
            entries = entries.Where(e => e.ExecutedBy == query.ExecutedBy);
        if (!string.IsNullOrWhiteSpace(query.ServerName))
            entries = entries.Where(e => e.ServerName == query.ServerName);
        if (!string.IsNullOrWhiteSpace(query.Status))
            entries = entries.Where(e => e.Status == query.Status);

        // "Newest first" must follow the TIME, not the Id: rows merged with `import-audit` get new, higher
        // Ids although they may be older. SQLite cannot ORDER BY a DateTimeOffset column, so the sort is done
        // here in two cheap steps: (1) read only Id + time of the matching rows and sort / page them in
        // memory, (2) load the full rows of that one page. The SQL text never travels for rows off the page.
        var keys = await entries.Select(e => new { e.Id, e.ExecutedAtUtc }).ToListAsync(ct);
        var pageIds = keys
            .OrderByDescending(k => k.ExecutedAtUtc)
            .ThenByDescending(k => k.Id) // same instant: the later insert first
            .Skip(query.Skip)
            .Take(query.Take)
            .Select(k => k.Id)
            .ToList();

        var page = await db.AuditLog.AsNoTracking().Where(e => pageIds.Contains(e.Id)).ToListAsync(ct);
        // The database returns that page in its own order; put it back in the order computed above.
        return page.OrderBy(e => pageIds.IndexOf(e.Id)).ToList();
    }
}
