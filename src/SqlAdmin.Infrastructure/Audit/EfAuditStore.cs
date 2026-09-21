using SqlAdmin.Core.Audit;

namespace SqlAdmin.Infrastructure.Audit;

public sealed class EfAuditStore(AuditDbContext db) : IAuditStore
{
    public async Task RecordAsync(AuditEntry entry, CancellationToken ct)
    {
        db.AuditLog.Add(entry);
        await db.SaveChangesAsync(ct);
    }
}
