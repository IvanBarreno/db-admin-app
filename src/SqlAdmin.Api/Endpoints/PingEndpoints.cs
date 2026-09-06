using SqlAdmin.Api.Contracts;

namespace SqlAdmin.Api.Endpoints;

/// <summary>
/// The smallest possible endpoint. It exists so Phase 0 can prove the whole chain works:
/// browser → Vite dev proxy → Kestrel → this handler → JSON back.
/// It also shows the pattern every future endpoint file follows.
/// </summary>
public static class PingEndpoints
{
    // An "extension method" on IEndpointRouteBuilder: it lets Program.cs call
    // app.MapPingEndpoints() as if that method were built into the framework.
    // `this` on the first parameter is what makes it an extension method.
    public static IEndpointRouteBuilder MapPingEndpoints(this IEndpointRouteBuilder app)
    {
        // MapGroup: every route registered on `group` is prefixed with /api,
        // and settings applied to the group (tags, auth, filters) apply to all of them.
        var group = app.MapGroup("/api")
                       .WithTags("System"); // groups the endpoint under "System" in the OpenAPI docs

        // GET /api/ping
        // The lambda IS the handler. ASP.NET Core inspects its parameters and fills them from
        // the request or from dependency injection. Here we ask for IHostEnvironment (a registered
        // service) so we can report which environment we run in.
        group.MapGet("/ping", (IHostEnvironment env) =>
        {
            var response = new PingResponse(
                Status: "ok",
                Environment: env.EnvironmentName,       // "Development" or "Production"
                ServerTimeUtc: DateTimeOffset.UtcNow,
                Version: typeof(PingEndpoints).Assembly.GetName().Version?.ToString() ?? "0.0.0");

            // TypedResults gives the OpenAPI generator the exact response type and status code.
            // Returning a plain object would also work, but the docs would be vaguer.
            return TypedResults.Ok(response);
        })
        .WithName("Ping")                     // operationId in OpenAPI → the TS client method name
        .WithSummary("Liveness check")        // shows up in the docs
        .WithDescription("Returns 200 with basic host information. Used by the frontend to detect the API.");

        return app; // returning the builder allows chaining: app.MapPingEndpoints().MapServersEndpoints()...
    }
}
