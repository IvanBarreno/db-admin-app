using System.Data.Common;
using Microsoft.Data.Sqlite;
using SqlAdmin.Core.Config;
using SqlAdmin.Core.Engines;

namespace SqlAdmin.Core.Tests;

// Test doubles for code that needs "a server connection": an in-memory SQLite database stands in for SQL
// Server, so lookups, checks and validators can be exercised without any server.

internal sealed class TestDialect : ISqlDialect
{
    public string QuoteIdentifier(string identifier) => $"[{identifier}]";
    public string ParameterPrefix => "@";
    public string? BatchSeparator => "GO";
}

internal sealed class TestEngine : IDatabaseEngine
{
    public string Id => "sqlserver";
    public string DisplayName => "Fake";
    public EngineCapabilities Capabilities => new(true, true, true, true, true, true);
    public ISqlDialect Dialect { get; } = new TestDialect();
    public DbConnection CreateConnection(ServerDefinition s, ResolvedCredentials c, string? d) => throw new NotSupportedException();
    public Task<ServerInfo> TestAsync(DbConnection c, CancellationToken ct) => throw new NotSupportedException();
    public Task<IReadOnlyList<DatabaseInfo>> ListDatabasesAsync(DbConnection c, CancellationToken ct) => throw new NotSupportedException();
    public IDisposable SubscribeToMessages(DbConnection c, List<string> m) => throw new NotSupportedException();
}

/// <summary>Hands out the same in-memory database on every call; callers' DisposeAsync does not close it.</summary>
internal sealed class SharedSqliteFactory(SqliteConnection shared) : IServerConnectionFactory
{
    private readonly TestEngine _engine = new();
    private readonly ServerDefinition _server = new() { Name = "SRV", Host = "fake", Engine = "sqlserver", Auth = AuthMode.Windows };

    public Task<ServerConnection> OpenAsync(string serverName, string? database, CancellationToken ct) =>
        Task.FromResult(new ServerConnection(_server, _engine, new NonDisposingConnection(shared)));
}

// ServerConnection.DisposeAsync disposes its connection; the in-memory DB would vanish, so wrap it.
internal sealed class NonDisposingConnection(SqliteConnection inner) : DbConnection
{
    [System.Diagnostics.CodeAnalysis.AllowNull]
    public override string ConnectionString { get => inner.ConnectionString; set { _ = value; } }
    public override string Database => inner.Database;
    public override string DataSource => inner.DataSource;
    public override string ServerVersion => inner.ServerVersion;
    public override System.Data.ConnectionState State => inner.State;
    public override void ChangeDatabase(string databaseName) { }
    public override void Close() { }
    public override void Open() { }
    protected override DbTransaction BeginDbTransaction(System.Data.IsolationLevel isolationLevel) => inner.BeginTransaction();
    protected override DbCommand CreateDbCommand() => inner.CreateCommand();
    protected override void Dispose(bool disposing) { }
    public override ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
