namespace SqlAdmin.Core.Audit;

public sealed record AuditQuery(
    string? ExecutedBy = null,
    string? ServerName = null,
    string? Status = null,
    int Skip = 0,
    int Take = 50);

public interface IAuditStore
{
    Task RecordAsync(AuditEntry entry, CancellationToken ct);

    /// <summary>Newest first, filtered by whichever <see cref="AuditQuery"/> fields are set.</summary>
    Task<IReadOnlyList<AuditEntry>> QueryAsync(AuditQuery query, CancellationToken ct);
}
