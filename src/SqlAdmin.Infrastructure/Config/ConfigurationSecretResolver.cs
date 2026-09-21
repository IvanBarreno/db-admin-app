using Microsoft.Extensions.Configuration;
using SqlAdmin.Core.Config;

namespace SqlAdmin.Infrastructure.Config;

/// <summary>
/// Resolves secrets through <see cref="IConfiguration"/>. That sounds too simple, but the
/// host already stacks the right providers for us, in this order (last wins):
///   appsettings.json → appsettings.{Env}.json → user-secrets (Development only) → environment variables → command line.
/// So <c>dotnet user-secrets set AZ_MAIN_PASS "..."</c> on a dev box and
/// <c>set AZ_MAIN_PASS=...</c> on a DBA's Windows machine both land here with zero extra code.
/// A Windows Credential Manager provider can be added later as another configuration source.
/// </summary>
public sealed class ConfigurationSecretResolver(IConfiguration configuration) : ISecretResolver
{
    public string? Resolve(string secretName)
    {
        var value = configuration[secretName];
        return string.IsNullOrEmpty(value) ? null : value;
    }
}
