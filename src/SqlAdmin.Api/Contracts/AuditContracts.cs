using SqlAdmin.Core.Audit;

namespace SqlAdmin.Api.Contracts;

/// <summary>GET /api/audit/{id}/steps — one step of a run.</summary>
public sealed record AuditStepResponse(
    int StepNo, string? Database, string Action, string Status, int? RowsAffected, string? Message)
{
    public static AuditStepResponse From(AuditStep s) =>
        new(s.StepNo, s.Database, s.Action, s.Status, s.RowsAffected, s.Message);
}

/// <summary>GET /api/audit — one row of the audit log, as shown in the Audit Log page.</summary>
public sealed record AuditEntryResponse(
    long Id,
    DateTimeOffset ExecutedAtUtc,
    string ExecutedBy,
    string ServerName,
    string? Database,
    string Sql,
    string Status,
    string? Detail,
    string? ParametersJson,
    // Number of per-database steps recorded for this run (0 for most runs). Lets the page disable
    // "Details" on rows that have nothing more to show, without fetching the steps of every row.
    int StepCount = 0)
{
    public static AuditEntryResponse From(AuditEntry entry, int stepCount = 0) => new(
        entry.Id,
        entry.ExecutedAtUtc,
        entry.ExecutedBy,
        entry.ServerName,
        entry.Database,
        entry.Sql,
        entry.Status,
        entry.Detail,
        entry.ParametersJson,
        stepCount);
}
