using SqlAdmin.Core.Operations;

namespace SqlAdmin.Api.Contracts;

/// <summary>GET /api/operations — one entry in the catalog, as the UI needs it to render the picker and ParamForm.</summary>
public sealed record OperationSummary(
    string Id,
    string Name,
    string Category,
    OperationScope Scope,
    bool Destructive,
    IReadOnlyList<OperationParameter> Params)
{
    public static OperationSummary From(OperationDefinition op) => new(
        op.Id, op.Name, op.Category, op.Scope, op.Destructive, op.Params);
}

/// <summary>POST /api/operations/{id}/preview and /execute — parameter values keyed by name, as typed in the form.</summary>
public sealed record OperationRequest(
    string ServerName,
    string? Database,
    Dictionary<string, string?> Params,
    // Token from /preview; required when the operation is destructive for these values.
    string? ConfirmToken = null,
    // Production servers only: the server name, typed by the DBA.
    string? ConfirmServerName = null);

/// <summary>
/// Result of /preview: the exact SQL that would run, nothing executed. When the operation is
/// destructive for these values, <paramref name="ConfirmToken"/> must be sent back to /execute
/// (and <paramref name="RequiresServerName"/> says the DBA must also type the server name).
/// </summary>
public sealed record OperationPreviewResult(
    string OperationId,
    IReadOnlyList<string> Batches,
    bool Destructive = false,
    string? ConfirmToken = null,
    bool RequiresServerName = false);

/// <summary>Result of /execute — same shape as the custom-SQL result, so the frontend reuses ResultsGrid.</summary>
public sealed record OperationExecuteResult(
    bool Success,
    long ElapsedMs,
    IReadOnlyList<CustomSqlResultSet> ResultSets,
    IReadOnlyList<string> Messages,
    int? FailedBatchIndex,
    string? Error,
    IReadOnlyList<ExecutionStepDto>? Steps = null,
    // Passwords the server generated (parameter name → value). Shown once, never stored or logged.
    IReadOnlyDictionary<string, string>? GeneratedPasswords = null,
    // Full path of the snapshot file, for operations with save_snapshot (null otherwise).
    string? SnapshotPath = null);

/// <summary>One per-database outcome of an all_databases run (null Steps for server/database scope).</summary>
public sealed record ExecutionStepDto(string Database, string Status, int RowCount, string? Message);
