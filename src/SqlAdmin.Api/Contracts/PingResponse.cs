namespace SqlAdmin.Api.Contracts;

/// <summary>
/// Response body of GET /api/ping.
/// </summary>
/// <remarks>
/// A "positional record": one line declares an immutable class with a constructor,
/// read-only properties, value equality and a readable ToString(). We use records for
/// every request/response DTO (Data Transfer Object) — they are data, not behaviour.
///
/// The property names become the JSON keys, camel-cased automatically:
///   { "status": "ok", "environment": "Development", "serverTimeUtc": "...", "version": "1.0.0.0" }
/// </remarks>
/// <param name="Status">Always "ok" when the API is alive.</param>
/// <param name="Environment">ASP.NET Core environment name (Development / Production).</param>
/// <param name="ServerTimeUtc">Current UTC time on the machine running the API.</param>
/// <param name="Version">Assembly version of the API.</param>
public sealed record PingResponse(
    string Status,
    string Environment,
    DateTimeOffset ServerTimeUtc,
    string Version);
