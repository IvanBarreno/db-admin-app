namespace SqlAdmin.Core.Engines;

/// <summary>
/// Feature flags describing an engine. The operation registry, the execution engine and
/// the UI consult these instead of checking <c>engine.Id == "azuresql"</c> everywhere —
/// so adding a new engine never means hunting for hard-coded ifs.
/// </summary>
/// <param name="SupportsUseDatabase">
/// Can we switch database with <c>USE [db]</c> on an open connection?
/// SQL Server: yes. Azure SQL: no — a new connection per database is needed.
/// </param>
/// <param name="SupportsServerLogins">Server-level principals (CREATE LOGIN). Azure SQL only partially (in master).</param>
/// <param name="SupportsWindowsAuth">Integrated Security. Azure SQL uses Entra ID instead.</param>
/// <param name="SupportsAgentJobs">SQL Server Agent (msdb jobs). Not available on Azure SQL Database.</param>
/// <param name="SupportsContainedUsers">Database users with their own password (no login). Both support it; Azure prefers it.</param>
/// <param name="SupportsBatchSeparator">Whether scripts may contain a client-side batch separator (GO) that we split on.</param>
public sealed record EngineCapabilities(
    bool SupportsUseDatabase,
    bool SupportsServerLogins,
    bool SupportsWindowsAuth,
    bool SupportsAgentJobs,
    bool SupportsContainedUsers,
    bool SupportsBatchSeparator);
