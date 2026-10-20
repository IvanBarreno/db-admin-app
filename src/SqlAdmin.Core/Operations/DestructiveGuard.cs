using System.Security.Cryptography;
using System.Text;
using SqlAdmin.Core.Config;

namespace SqlAdmin.Core.Operations;

/// <summary>Thrown when a destructive operation is executed without a valid confirmation. Maps to HTTP 428.</summary>
public sealed class ConfirmationRequiredException(string message) : Exception(message);

/// <summary>
/// Gatekeeper for destructive operations (§5 "Execution engine rules"):
///   1. <c>preview</c> issues a short-lived token bound to the exact request
///      (operation + server + database + parameter values).
///   2. <c>execute</c> must present that token; any change to the request invalidates it, so the
///      DBA can only run what they previewed.
///   3. On a Production server the DBA must also type the server name.
/// The token is an HMAC with a random per-process key, so it needs no storage and simply stops
/// working after a restart or after <see cref="Lifetime"/>.
/// </summary>
public sealed class DestructiveGuard
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(5);

    private readonly byte[] key = RandomNumberGenerator.GetBytes(32);
    private readonly TimeProvider time;

    public DestructiveGuard(TimeProvider? time = null) => this.time = time ?? TimeProvider.System;

    public string IssueToken(
        OperationDefinition operation, string serverName, string? database,
        IReadOnlyDictionary<string, string?> values)
    {
        var expires = time.GetUtcNow().Add(Lifetime).ToUnixTimeSeconds();
        return $"{expires}.{Sign(operation.Id, serverName, database, values, expires)}";
    }

    /// <exception cref="ConfirmationRequiredException">Token missing/expired/for another request, or the server name wasn't typed on Production.</exception>
    public void Validate(
        OperationDefinition operation, ServerDefinition server, string? database,
        IReadOnlyDictionary<string, string?> values, string? confirmToken, string? typedServerName)
    {
        if (string.IsNullOrWhiteSpace(confirmToken))
            throw new ConfirmationRequiredException("This operation is destructive: preview it first and confirm.");

        var parts = confirmToken.Split('.', 2);
        if (parts.Length != 2 || !long.TryParse(parts[0], out var expires))
            throw new ConfirmationRequiredException("Invalid confirmation token.");

        if (time.GetUtcNow().ToUnixTimeSeconds() > expires)
            throw new ConfirmationRequiredException("The confirmation expired. Preview the operation again.");

        var expected = Sign(operation.Id, server.Name, database, values, expires);
        // Constant-time compare: don't leak how many leading characters matched.
        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(parts[1])))
            throw new ConfirmationRequiredException("The confirmation does not match this request. Preview the operation again.");

        if (server.IsProduction && !string.Equals(typedServerName, server.Name, StringComparison.Ordinal))
            throw new ConfirmationRequiredException($"Production server: type the server name '{server.Name}' to confirm.");
    }

    private string Sign(string operationId, string serverName, string? database,
        IReadOnlyDictionary<string, string?> values, long expires)
    {
        // Canonical text of the request. Sorted keys + a separator that can't appear in a
        // parameter name keep two different requests from producing the same payload.
        var sb = new StringBuilder()
            .Append(operationId).Append('\n').Append(serverName).Append('\n')
            .Append(database ?? "").Append('\n').Append(expires);
        foreach (var (name, value) in values.OrderBy(kv => kv.Key, StringComparer.Ordinal))
            sb.Append('\n').Append(name).Append('=').Append(value ?? "");

        var mac = HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(sb.ToString()));
        return Convert.ToBase64String(mac);
    }
}
