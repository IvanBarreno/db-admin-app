using System.Data.Common;
using System.Diagnostics;
using Microsoft.AspNetCore.Http.HttpResults;
using SqlAdmin.Api.Contracts;
using SqlAdmin.Core.Config;
using SqlAdmin.Core.Engines;
using SqlAdmin.Core.Lookups;

namespace SqlAdmin.Api.Endpoints;

/// <summary>/api/servers — the configured server list, connection tests and database pickers.</summary>
public static class ServersEndpoints
{
    public static IEndpointRouteBuilder MapServersEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/servers").WithTags("Servers");

        // GET /api/servers
        // Parameters that are registered services (IServerCatalog, IEngineRegistry) are injected;
        // ASP.NET Core figures out which parameters come from DI and which from the request.
        group.MapGet("/", (IServerCatalog catalog, IEngineRegistry engines) =>
            {
                var list = catalog.All
                    .Select(s => ServerSummary.From(s, engines.Get(s.Engine)))
                    .ToList();
                return TypedResults.Ok(list);
            })
            .WithName("ListServers")
            .WithSummary("Configured servers (never includes credentials)");

        // GET /api/servers/{name}
        // Results<Ok<T>, NotFound> is a union return type: OpenAPI learns BOTH possible responses.
        group.MapGet("/{name}", Results<Ok<ServerSummary>, NotFound> (string name, IServerCatalog catalog, IEngineRegistry engines) =>
            {
                var server = catalog.Find(name);
                return server is null
                    ? TypedResults.NotFound()
                    : TypedResults.Ok(ServerSummary.From(server, engines.Get(server.Engine)));
            })
            .WithName("GetServer")
            .WithSummary("One server by name");

        // POST /api/servers/{name}/test
        // The CancellationToken parameter is wired to the HTTP request: if the browser
        // aborts (user navigates away), the token fires and OpenAsync/ExecuteReaderAsync stop.
        group.MapPost("/{name}/test", async (string name, IServerConnectionFactory connections, CancellationToken ct) =>
            {
                var stopwatch = Stopwatch.StartNew();
                try
                {
                    // `await using` disposes the connection (returns it to the pool) when the block ends,
                    // even if an exception is thrown.
                    await using var conn = await connections.OpenAsync(name, database: null, ct);
                    var info = await conn.Engine.TestAsync(conn.Connection, ct);
                    return TypedResults.Ok(new ConnectionTestResult(true, stopwatch.ElapsedMilliseconds, info, null));
                }
                catch (Exception ex) when (ex is DbException or MissingSecretException)
                {
                    // Expected failure modes of a *test*: wrong password, firewall, missing secret.
                    // Anything else (bug, unknown server → 404) still propagates to the exception handler.
                    return TypedResults.Ok(new ConnectionTestResult(false, stopwatch.ElapsedMilliseconds, null, ex.Message));
                }
            })
            .WithName("TestServerConnection")
            .WithSummary("Open a connection and report server version, edition and login identity");

        // GET /api/servers/{name}/databases
        group.MapGet("/{name}/databases", async (string name, IServerConnectionFactory connections, CancellationToken ct) =>
            {
                await using var conn = await connections.OpenAsync(name, database: null, ct);
                var databases = await conn.Engine.ListDatabasesAsync(conn.Connection, ct);
                return TypedResults.Ok(databases);
            })
            .WithName("ListDatabases")
            .WithSummary("User databases on the server, for pickers");

        // GET /api/servers/{name}/lookups/{id}?database=&login_name=...
        // One endpoint for every picker/checklist/Explorer tab (lookups/*.yaml). `database` selects the
        // database for database-scoped lookups; every other query value is offered to the lookup as an arg.
        group.MapGet("/{name}/lookups/{id}", async Task<Results<Ok<LookupResult>, ProblemHttpResult>> (
                string name,
                string id,
                HttpRequest http,
                IServerCatalog catalog,
                ILookupRegistry lookups,
                IServerConnectionFactory connections,
                CancellationToken ct) =>
            {
                var server = catalog.Find(name);
                if (server is null)
                {
                    return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound,
                        title: "Unknown server", detail: $"Server '{name}' is not configured.");
                }

                var query = http.Query.ToDictionary(q => q.Key, q => (string?)q.Value.ToString());
                var database = query.GetValueOrDefault("database");

                // Resolve the variant for this server's engine: needs the engine id, not a connection.
                var lookup = lookups.Find(id, server.Engine);
                if (lookup is null)
                {
                    return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound,
                        title: "Unknown lookup", detail: $"No lookup '{id}' for engine '{server.Engine}'.");
                }

                if (lookup.Scope == LookupScope.Database && string.IsNullOrWhiteSpace(database))
                {
                    return TypedResults.Problem(statusCode: StatusCodes.Status400BadRequest,
                        title: "Database required", detail: $"Lookup '{id}' runs inside a database; pass ?database=.");
                }

                await using var conn = await connections.OpenAsync(name, lookup.DatabaseToOpen(database), ct);
                var result = await LookupRunner.RunAsync(
                    lookup, conn.Connection, conn.Engine.Dialect, query, server.CommandTimeoutSeconds, ct);
                return TypedResults.Ok(result);
            })
            .WithName("RunLookup")
            .WithSummary("Server-driven list for pickers, checklists and the Explorer");

        return app;
    }
}
