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
    Dictionary<string, string?> Params);

/// <summary>Result of /preview: the exact SQL that would run, nothing executed.</summary>
public sealed record OperationPreviewResult(string OperationId, IReadOnlyList<string> Batches);

/// <summary>Result of /execute — same shape as the custom-SQL result, so the frontend reuses ResultsGrid.</summary>
public sealed record OperationExecuteResult(
    bool Success,
    long ElapsedMs,
    IReadOnlyList<CustomSqlResultSet> ResultSets,
    IReadOnlyList<string> Messages,
    int? FailedBatchIndex,
    string? Error);
