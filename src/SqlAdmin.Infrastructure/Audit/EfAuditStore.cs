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

    public async Task<IReadOnlyList<AuditEntry>> QueryAsync(AuditQuery query, CancellationToken ct)
    {
        var entries = db.AuditLog.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.ExecutedBy))
            entries = entries.Where(e => e.ExecutedBy == query.ExecutedBy);
        if (!string.IsNullOrWhiteSpace(query.ServerName))
            entries = entries.Where(e => e.ServerName == query.ServerName);
        if (!string.IsNullOrWhiteSpace(query.Status))
            entries = entries.Where(e => e.Status == query.Status);

        // SQLite can't ORDER BY a DateTimeOffset column; Id is autoincrement and inserted in
        // execution order, so ordering by it gives the same "newest first" result.
        return await entries
            .OrderByDescending(e => e.Id)
            .Skip(query.Skip)
            .Take(query.Take)
            .ToListAsync(ct);
    }
}
