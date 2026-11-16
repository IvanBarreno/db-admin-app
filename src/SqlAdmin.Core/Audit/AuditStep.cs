namespace SqlAdmin.Core.Audit;

/// <summary>
/// One sub-action of an <see cref="AuditEntry"/> — e.g. one database of an all_databases run.
/// The parent row says "operation X ran"; steps say which databases succeeded or failed.
/// </summary>
public sealed class AuditStep
{
    public long Id { get; init; }
    public long AuditEntryId { get; init; }
    public required int StepNo { get; init; }
    public string? Database { get; init; }
    public required string Action { get; init; }
    public required string Status { get; init; } // "OK" | "SKIPPED" | "ERROR"
    public int? RowsAffected { get; init; }
    public string? Message { get; init; }
    public required DateTimeOffset ExecutedAtUtc { get; init; }
}
