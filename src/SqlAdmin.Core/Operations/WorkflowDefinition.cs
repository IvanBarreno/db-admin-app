namespace SqlAdmin.Core.Operations;

/// <summary>
/// One step of a <see cref="WorkflowDefinition"/>: a registered operation plus how its parameters are filled.
/// The T-SQL stays in the YAML operation; the workflow only decides ORDER and WHICH steps run.
/// </summary>
/// <param name="Key">Stable id of the step inside the workflow (what the UI sends to select it).</param>
/// <param name="Title">What the DBA reads in the checklist.</param>
/// <param name="OperationId">Id of the registered (YAML) operation this step runs.</param>
/// <param name="DefaultOn">Pre-ticked in the UI.</param>
/// <param name="Required">Always runs and cannot be unticked (e.g. the snapshot).</param>
/// <param name="NeedsNewOwner">Uses the workflow's <c>new_owner</c> value, so that value becomes mandatory when the step is selected.</param>
/// <param name="FixedValues">Parameter values this step always uses (e.g. <c>action = DISABLE</c>).</param>
public sealed record WorkflowStep(
    string Key,
    string Title,
    string OperationId,
    bool Required = false,
    bool DefaultOn = true,
    bool NeedsNewOwner = false,
    IReadOnlyDictionary<string, string>? FixedValues = null);

/// <summary>
/// A guided checklist: an ordered list of steps over registered operations, run in one go with
/// per-step status. This is the "code-based operation" of Phase 4 — kept as plain composition of the
/// YAML operations (already verified against real servers) instead of a second way to write T-SQL.
/// </summary>
public sealed record WorkflowDefinition(
    string Id,
    string Name,
    string Description,
    IReadOnlyList<OperationParameter> Params,
    IReadOnlyList<WorkflowStep> Steps,
    IReadOnlyList<string> Notes);

/// <summary>The workflows the app ships with.</summary>
public static class Workflows
{
    public const string OffboardingId = "offboarding.full";

    /// <summary>Order matters: each step assumes the previous ones ran (drop_login re-checks them).</summary>
    public static readonly WorkflowDefinition Offboarding = new(
        OffboardingId,
        "Offboard a login",
        "Removes a person's access in the safe order. Pick which steps to run; a failed step stops the rest, so you can fix the cause and run the remaining ones again.",
        [
            new OperationParameter { Name = "login_name", Type = OperationParameterType.Login },
            new OperationParameter { Name = "new_owner", Type = OperationParameterType.Login, Required = false },
        ],
        [
            new("snapshot", "Snapshot the login's access (saved to a file)", "offboarding.snapshot", Required: true),
            new("disable", "Disable the login", "changes.set_login_enabled",
                FixedValues: new Dictionary<string, string> { ["action"] = "DISABLE" }),
            new("kill_sessions", "Kill active sessions", "offboarding.kill_sessions"),
            new("reassign_jobs", "Reassign SQL Agent jobs to the new owner", "offboarding.reassign_jobs", NeedsNewOwner: true),
            new("reassign_databases", "Reassign owned databases to the new owner", "offboarding.reassign_databases", NeedsNewOwner: true),
            new("revoke_access", "Remove server roles and revoke server permissions", "offboarding.revoke_server_access"),
            new("drop_users", "Drop the user in every online database", "offboarding.drop_users"),
            new("drop_login", "Drop the login", "offboarding.drop_login"),
        ],
        [
            "Only ONLINE databases are visited by 'Drop the user in every online database'. A user in an offline database stays behind as an orphan.",
            "'Drop the login' re-checks sessions, owned databases and owned jobs right before dropping, and fails if any remain.",
        ]);

    public static WorkflowDefinition? Find(string id) =>
        string.Equals(id, OffboardingId, StringComparison.Ordinal) ? Offboarding : null;

    public static IReadOnlyList<WorkflowDefinition> All { get; } = [Offboarding];
}
