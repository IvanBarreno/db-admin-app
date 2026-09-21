namespace SqlAdmin.Core.Audit;

/// <summary>One recorded execution — a custom-SQL run today, an <c>IOperation</c> step later.</summary>
public sealed class AuditEntry
{
    public long Id { get; init; }
    public required DateTimeOffset ExecutedAtUtc { get; init; }
    public required string ExecutedBy { get; init; }
    public required string ServerName { get; init; }
    public string? Database { get; init; }
    public required string Sql { get; init; }
    public required string Status { get; init; } // "Success" | "Failed"
    public string? Detail { get; init; } // error message, or null on success
}
