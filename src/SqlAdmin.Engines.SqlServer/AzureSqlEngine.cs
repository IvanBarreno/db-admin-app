using SqlAdmin.Core.Engines;

namespace SqlAdmin.Engines.SqlServer;

/// <summary>
/// Azure SQL Database (the PaaS offering). Same driver and T-SQL as SQL Server, but:
/// no <c>USE</c> (one connection per database), no SQL Agent, no Windows auth,
/// and logins live only in master — contained database users are the norm.
/// </summary>
public sealed class AzureSqlEngine : SqlClientEngineBase
{
    public const string EngineId = "azuresql";

    public override string Id => EngineId;
    public override string DisplayName => "Azure SQL Database";

    public override EngineCapabilities Capabilities { get; } = new(
        SupportsUseDatabase: false,
        SupportsServerLogins: false,   // possible in master, but not the recommended model — revisit if needed
        SupportsWindowsAuth: false,
        SupportsAgentJobs: false,
        SupportsContainedUsers: true,
        SupportsBatchSeparator: true);
}
