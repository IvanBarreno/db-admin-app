using SqlAdmin.Core.Engines;

namespace SqlAdmin.Engines.SqlServer;

/// <summary>On-premises / VM SQL Server (any edition, 2016+). Full feature set.</summary>
public sealed class SqlServerEngine : SqlClientEngineBase
{
    public const string EngineId = "sqlserver";

    public override string Id => EngineId;
    public override string DisplayName => "SQL Server";

    public override EngineCapabilities Capabilities { get; } = new(
        SupportsUseDatabase: true,
        SupportsServerLogins: true,
        SupportsWindowsAuth: true,
        SupportsAgentJobs: true,
        SupportsContainedUsers: true,
        SupportsBatchSeparator: true);
}
