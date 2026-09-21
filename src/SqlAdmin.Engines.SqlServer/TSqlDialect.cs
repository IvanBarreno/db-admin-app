using SqlAdmin.Core.Engines;

namespace SqlAdmin.Engines.SqlServer;

/// <summary>T-SQL syntax details, shared by SQL Server and Azure SQL.</summary>
public sealed class TSqlDialect : ISqlDialect
{
    public static readonly TSqlDialect Instance = new();

    /// <summary>
    /// Same rules as T-SQL's QUOTENAME(): wrap in [ ] and double any ] inside.
    /// "my]db" → "[my]]db]". An empty name is rejected rather than producing "[]".
    /// </summary>
    public string QuoteIdentifier(string identifier)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(identifier);

        if (identifier.Length > 128)
        {
            throw new ArgumentException("SQL Server identifiers are limited to 128 characters.", nameof(identifier));
        }

        return "[" + identifier.Replace("]", "]]") + "]";
    }

    public string ParameterPrefix => "@";

    public string? BatchSeparator => "GO";
}
