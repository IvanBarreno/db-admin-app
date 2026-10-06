using SqlAdmin.Core.Audit;

namespace SqlAdmin.Api.Contracts;

/// <summary>GET /api/audit — one row of the audit log, as shown in the Audit Log page.</summary>
public sealed record AuditEntryResponse(
    long Id,
    DateTimeOffset ExecutedAtUtc,
    string ExecutedBy,
    string ServerName,
    string? Database,
    string Sql,
    string Status,
    string? Detail)
{
    public static AuditEntryResponse From(AuditEntry entry) => new(
        entry.Id,
        entry.ExecutedAtUtc,
        entry.ExecutedBy,
        entry.ServerName,
        entry.Database,
        entry.Sql,
        entry.Status,
        entry.Detail);
}
