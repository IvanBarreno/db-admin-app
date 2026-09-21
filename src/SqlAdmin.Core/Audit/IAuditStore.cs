namespace SqlAdmin.Core.Audit;

public interface IAuditStore
{
    Task RecordAsync(AuditEntry entry, CancellationToken ct);
}
