namespace SqlAdmin.Core.Operations;

/// <summary>Where an operation's SQL runs.</summary>
public enum OperationScope
{
    /// <summary>Runs once against the server connection (no specific database).</summary>
    Server,
    /// <summary>Runs once against one chosen database.</summary>
    Database,
    /// <summary>Runs once per online user database, results unioned per database.</summary>
    AllDatabases,
}
