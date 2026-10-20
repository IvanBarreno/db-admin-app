using System.Data.Common;
using SqlAdmin.Core.Config;

namespace SqlAdmin.Core.Engines;

/// <summary>
/// The abstraction that keeps Core independent from any specific database product.
/// SQL Server, Azure SQL and (one day) Postgres each provide an implementation; the rest of
/// the app only ever talks to this interface plus the ADO.NET base classes
/// (<see cref="DbConnection"/>, <see cref="DbCommand"/>, <see cref="DbDataReader"/>).
/// </summary>
public interface IDatabaseEngine
{
    /// <summary>Stable identifier matched against <see cref="ServerDefinition.Engine"/>: "sqlserver", "azuresql", ...</summary>
    string Id { get; }

    /// <summary>Human-readable name for the UI ("SQL Server", "Azure SQL Database").</summary>
    string DisplayName { get; }

    /// <summary>What this engine can and cannot do; operations and UI adapt to it.</summary>
    EngineCapabilities Capabilities { get; }

    /// <summary>Quoting, batch separator and other syntax differences.</summary>
    ISqlDialect Dialect { get; }

    /// <summary>
    /// Builds an <b>unopened</b> connection. The caller opens it (ideally with
    /// <c>await conn.OpenAsync(ct)</c>) and disposes it. Nothing touches the network here.
    /// </summary>
    /// <param name="server">Where to connect and how (host, port, auth mode, TLS options).</param>
    /// <param name="credentials">Resolved username/password for SQL auth; <see cref="ResolvedCredentials.None"/> otherwise.</param>
    /// <param name="database">Initial catalog; null = <see cref="ServerDefinition.DefaultDatabase"/> or the login default.</param>
    DbConnection CreateConnection(ServerDefinition server, ResolvedCredentials credentials, string? database);

    /// <summary>Runs a trivial query and reports who/what we're connected to.</summary>
    Task<ServerInfo> TestAsync(DbConnection connection, CancellationToken ct);

    /// <summary>User databases available for pickers (system databases excluded).</summary>
    Task<IReadOnlyList<DatabaseInfo>> ListDatabasesAsync(DbConnection connection, CancellationToken ct);

    /// <summary>
    /// Subscribes to the provider's "informational message" event (T-SQL PRINT / RAISERROR
    /// severity &lt;= 10 on <c>SqlConnection.InfoMessage</c>) and appends each message to
    /// <paramref name="messages"/>. The generic <see cref="DbConnection"/> base has no such
    /// event, so each engine wires its own provider type here; Core stays driver-agnostic.
    /// Returns an <see cref="IDisposable"/> that unsubscribes.
    /// </summary>
    IDisposable SubscribeToMessages(DbConnection connection, List<string> messages);
}

/// <summary>Result of a successful connection test.</summary>
public sealed record ServerInfo(
    string ServerName,
    string Version,
    string Edition,
    string LoginName,
    string CurrentDatabase,
    bool IsSysAdmin);

/// <summary>One database as shown in a picker.</summary>
public sealed record DatabaseInfo(
    string Name,
    string State,     // ONLINE, RESTORING, OFFLINE, ...
    string? Owner,
    bool IsOnline);
