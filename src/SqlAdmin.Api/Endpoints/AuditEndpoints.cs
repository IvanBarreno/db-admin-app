using SqlAdmin.Api.Contracts;
using SqlAdmin.Core.Audit;

namespace SqlAdmin.Api.Endpoints;

/// <summary>/api/audit — read-only view over the audit log, filtered for the Audit Log page.</summary>
public static class AuditEndpoints
{
    public static IEndpointRouteBuilder MapAuditEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/audit?executedBy=&serverName=&status=&skip=&take=
        app.MapGet("/api/audit", async (
                string? executedBy,
                string? serverName,
                string? status,
                int skip,
                int take,
                IAuditStore auditStore,
                CancellationToken ct) =>
            {
                var query = new AuditQuery(
                    ExecutedBy: executedBy,
                    ServerName: serverName,
                    Status: status,
                    Skip: skip,
                    Take: take == 0 ? 50 : Math.Min(take, 200));

                var entries = await auditStore.QueryAsync(query, ct);
                return TypedResults.Ok(entries.Select(AuditEntryResponse.From).ToList());
            })
            .WithName("ListAuditEntries")
            .WithSummary("Audit log entries, newest first, optionally filtered by user/server/status");

        // GET /api/audit/{id}/steps — per-database log of one run, for the StepLog component
        app.MapGet("/api/audit/{id:long}/steps", async (long id, IAuditStore auditStore, CancellationToken ct) =>
            {
                var steps = await auditStore.GetStepsAsync(id, ct);
                return TypedResults.Ok(steps.Select(AuditStepResponse.From).ToList());
            })
            .WithName("ListAuditSteps")
            .WithSummary("Steps (e.g. one per database) recorded for an audit entry");

        return app;
    }
}
