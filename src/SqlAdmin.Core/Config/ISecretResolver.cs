namespace SqlAdmin.Core.Config;

/// <summary>
/// Looks up secret VALUES by NAME. servers.json only ever contains names such as
/// "AZ_MAIN_PASS"; where the value comes from (environment variable, dotnet user-secrets,
/// Windows Credential Manager) is an Infrastructure concern hidden behind this interface.
/// </summary>
public interface ISecretResolver
{
    /// <summary>Returns the secret value, or null when nothing is configured under that name.</summary>
    string? Resolve(string secretName);
}

/// <summary>
/// Username/password pair for <see cref="AuthMode.Sql"/>. Both are null for Windows / Entra ID
/// authentication, where the identity comes from the OS or a token instead.
/// </summary>
/// <remarks>
/// Deliberately NOT a record: records generate a ToString() that would print the password
/// into logs and exception messages. A plain class with a custom ToString() keeps it out.
/// </remarks>
public sealed class ResolvedCredentials
{
    public static readonly ResolvedCredentials None = new(null, null);

    public ResolvedCredentials(string? username, string? password)
    {
        Username = username;
        Password = password;
    }

    public string? Username { get; }
    public string? Password { get; }

    public bool HasPassword => !string.IsNullOrEmpty(Password);

    public override string ToString() =>
        $"ResolvedCredentials(Username={Username ?? "<none>"}, Password={(HasPassword ? "***" : "<none>")})";
}
