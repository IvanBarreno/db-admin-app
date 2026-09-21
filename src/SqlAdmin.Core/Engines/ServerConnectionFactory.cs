using System.Data.Common;
using SqlAdmin.Core.Config;

namespace SqlAdmin.Core.Engines;

/// <summary>
/// The one entry point for "give me an open connection to server X".
/// It composes three Core contracts — catalog, engine registry, secret resolver — so callers
/// (endpoints, the execution engine) never deal with credentials or engine selection.
/// </summary>
public interface IServerConnectionFactory
{
    /// <summary>
    /// Resolves the server, its engine and its credentials, then opens the connection.
    /// The returned <see cref="ServerConnection"/> owns the connection: dispose it with <c>await using</c>.
    /// </summary>
    /// <exception cref="ServerNotFoundException">No server with that name is configured.</exception>
    /// <exception cref="MissingSecretException">SQL auth is configured but a secret is not set.</exception>
    Task<ServerConnection> OpenAsync(string serverName, string? database, CancellationToken ct);
}

/// <summary>An open connection together with the server and engine it belongs to.</summary>
public sealed class ServerConnection(ServerDefinition server, IDatabaseEngine engine, DbConnection connection) : IAsyncDisposable
{
    public ServerDefinition Server { get; } = server;
    public IDatabaseEngine Engine { get; } = engine;
    public DbConnection Connection { get; } = connection;

    public ValueTask DisposeAsync() => Connection.DisposeAsync();
}

/// <summary>Default implementation; pure composition, no I/O of its own.</summary>
public sealed class ServerConnectionFactory(
    IServerCatalog catalog,
    IEngineRegistry engines,
    ISecretResolver secrets) : IServerConnectionFactory
{
    // The constructor above is a "primary constructor": its parameters are captured as private
    // fields automatically, so there is no boilerplate `_catalog = catalog;` assignment code.

    public async Task<ServerConnection> OpenAsync(string serverName, string? database, CancellationToken ct)
    {
        var server = catalog.Find(serverName) ?? throw new ServerNotFoundException(serverName);
        var engine = engines.Get(server.Engine);
        var credentials = ResolveCredentials(server);

        var connection = engine.CreateConnection(server, credentials, database);
        try
        {
            await connection.OpenAsync(ct);
            return new ServerConnection(server, engine, connection);
        }
        catch
        {
            // If OpenAsync throws we still own the connection object; don't leak it.
            await connection.DisposeAsync();
            throw;
        }
    }

    private ResolvedCredentials ResolveCredentials(ServerDefinition server)
    {
        if (server.Auth != AuthMode.Sql)
        {
            // Windows and Entra ID identities come from the OS / a token, not from us.
            return ResolvedCredentials.None;
        }

        var username = Require(server, server.UsernameSecret, nameof(server.UsernameSecret));
        var password = Require(server, server.PasswordSecret, nameof(server.PasswordSecret));
        return new ResolvedCredentials(username, password);
    }

    private string Require(ServerDefinition server, string? secretName, string field)
    {
        if (string.IsNullOrWhiteSpace(secretName))
        {
            throw new MissingSecretException(server.Name, $"{field} is not set in servers.json but Auth is Sql.");
        }

        return secrets.Resolve(secretName)
            ?? throw new MissingSecretException(server.Name,
                $"Secret '{secretName}' has no value. Set it as an environment variable or with `dotnet user-secrets set {secretName} <value>`.");
    }
}

public sealed class ServerNotFoundException(string serverName)
    : Exception($"Server '{serverName}' is not configured.")
{
    public string ServerName { get; } = serverName;
}

public sealed class MissingSecretException(string serverName, string reason)
    : Exception($"Cannot connect to '{serverName}': {reason}")
{
    public string ServerName { get; } = serverName;
}
