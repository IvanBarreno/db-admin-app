using Microsoft.Extensions.Options;
using SqlAdmin.Core.Config;
using SqlAdmin.Core.Engines;

namespace SqlAdmin.Infrastructure.Config;

/// <summary>
/// Startup validation for the Servers section. Because it is registered with
/// <c>ValidateOnStart()</c>, a bad servers.json stops the app at launch with a readable
/// list of problems instead of a confusing failure the first time someone clicks "Test".
/// </summary>
/// <remarks>
/// <see cref="IValidateOptions{TOptions}"/> is the hook the Options system calls. It can take
/// dependencies through DI — here the engine registry, so we can reject engine ids that no
/// loaded engine implements.
/// </remarks>
public sealed class ServersOptionsValidator(IEngineRegistry engines) : IValidateOptions<ServersOptions>
{
    public ValidateOptionsResult Validate(string? name, ServersOptions options)
    {
        var errors = new List<string>();

        if (options.Items.Count == 0)
        {
            errors.Add("Servers:Items is empty — add at least one server to servers.json.");
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (var i = 0; i < options.Items.Count; i++)
        {
            var item = options.Items[i];
            var label = string.IsNullOrWhiteSpace(item.Name) ? $"Servers:Items[{i}]" : $"server '{item.Name}'";

            if (string.IsNullOrWhiteSpace(item.Name))
                errors.Add($"{label}: Name is required.");
            else if (!seen.Add(item.Name))
                errors.Add($"{label}: duplicate Name (names are case-insensitive).");

            if (string.IsNullOrWhiteSpace(item.Host))
                errors.Add($"{label}: Host is required.");

            // Overrides may switch Auth, so validate the *effective* auth mode.
            ServerOverride? ovr = null;
            if (item.Name is not null)
                options.Overrides.TryGetValue(item.Name, out ovr);

            var rawAuth = ovr?.Auth ?? item.Auth;
            AuthMode? effectiveAuth = null;
            if (string.IsNullOrWhiteSpace(rawAuth))
            {
                errors.Add($"{label}: Auth is required (Sql, Windows or EntraId).");
            }
            else if (!Enum.TryParse<AuthMode>(rawAuth, ignoreCase: true, out var parsedAuth))
            {
                errors.Add($"{label}: unknown Auth '{rawAuth}'. Valid values: {string.Join(", ", Enum.GetNames<AuthMode>())}.");
            }
            else
            {
                effectiveAuth = parsedAuth;
            }

            if (effectiveAuth == AuthMode.Sql)
            {
                var user = ovr?.UsernameSecret ?? item.UsernameSecret;
                var pass = ovr?.PasswordSecret ?? item.PasswordSecret;
                if (string.IsNullOrWhiteSpace(user) || string.IsNullOrWhiteSpace(pass))
                    errors.Add($"{label}: Auth is Sql, so UsernameSecret and PasswordSecret (secret NAMES) are required.");
            }

            var engineId = item.Engine ?? options.Defaults.Engine;
            if (!engines.TryGet(engineId, out _))
                errors.Add($"{label}: unknown Engine '{engineId}'. Available: {string.Join(", ", engines.All.Select(e => e.Id))}.");

            if (!string.IsNullOrWhiteSpace(item.Environment) && !Enum.TryParse<ServerEnvironment>(item.Environment, ignoreCase: true, out _))
                errors.Add($"{label}: unknown Environment '{item.Environment}'. Valid values: {string.Join(", ", Enum.GetNames<ServerEnvironment>())}.");

            if ((item.CommandTimeoutSeconds ?? options.Defaults.CommandTimeoutSeconds) <= 0)
                errors.Add($"{label}: CommandTimeoutSeconds must be positive.");
        }

        foreach (var key in options.Overrides.Keys.Where(k => !seen.Contains(k)))
        {
            errors.Add($"Servers:Overrides:{key} does not match any server Name in servers.json.");
        }

        return errors.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(errors);
    }
}
