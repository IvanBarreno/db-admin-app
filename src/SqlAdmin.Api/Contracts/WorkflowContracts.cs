using SqlAdmin.Core.Operations;

namespace SqlAdmin.Api.Contracts;

/// <summary>GET /api/workflows — a guided checklist as the UI needs it: parameters to ask for and the steps to tick.</summary>
public sealed record WorkflowSummary(
    string Id,
    string Name,
    string Description,
    IReadOnlyList<OperationParameter> Params,
    IReadOnlyList<WorkflowStepSummary> Steps,
    IReadOnlyList<string> Notes)
{
    public static WorkflowSummary From(WorkflowDefinition w, IOperationRegistry registry) => new(
        w.Id, w.Name, w.Description, w.Params,
        w.Steps.Select(s => new WorkflowStepSummary(
            s.Key, s.Title, s.OperationId, s.Required, s.DefaultOn, s.NeedsNewOwner,
            // Destructive for THIS step's fixed values (e.g. disable = DISABLE), or always for destructive operations.
            registry.Find(s.OperationId) is { } op
                && op.RequiresConfirmation(s.FixedValues?.ToDictionary(kv => kv.Key, kv => (string?)kv.Value)
                                           ?? new Dictionary<string, string?>()))).ToList(),
        w.Notes);
}

public sealed record WorkflowStepSummary(
    string Key,
    string Title,
    string OperationId,
    bool Required,
    bool DefaultOn,
    bool NeedsNewOwner,
    bool Destructive);

/// <summary>POST /api/workflows/{id}/preview and /execute. <paramref name="Steps"/> are the ticked step keys.</summary>
public sealed record WorkflowRequest(
    string ServerName,
    Dictionary<string, string?> Params,
    List<string> Steps,
    string? ConfirmToken = null,
    string? ConfirmServerName = null);

/// <summary>The exact SQL of every selected step, nothing executed. Token/server-name rules match single operations.</summary>
public sealed record WorkflowPreviewResult(
    string WorkflowId,
    IReadOnlyList<WorkflowPlannedStep> Steps,
    bool Destructive,
    string? ConfirmToken,
    bool RequiresServerName,
    // Preflight checks of every selected step; a blocking failure withholds the token.
    IReadOnlyList<WorkflowCheckResult> Checks,
    // Dry-run report: counts of what the run will touch (null when the workflow has none or it can't be read).
    SqlAdmin.Core.Lookups.LookupResult? Impact);

public sealed record WorkflowPlannedStep(
    string Key,
    string Title,
    string OperationId,
    bool Destructive,
    IReadOnlyList<string> Batches,
    // The exact statements this step will execute (null for steps without dry-run support, e.g. the snapshot).
    IReadOnlyList<DryRunStatement>? Statements = null);

/// <summary>Per-step outcome. Status: OK | FAILED | NOT_RUN.</summary>
public sealed record WorkflowStepResult(
    string Key,
    string Title,
    string OperationId,
    string Status,
    long ElapsedMs,
    IReadOnlyList<CustomSqlResultSet> ResultSets,
    IReadOnlyList<string> Messages,
    string? Error,
    IReadOnlyList<ExecutionStepDto>? Steps,
    string? SnapshotPath);

public sealed record WorkflowExecuteResult(
    bool Success,
    long ElapsedMs,
    IReadOnlyList<WorkflowStepResult> Steps,
    IReadOnlyList<string> Warnings);
