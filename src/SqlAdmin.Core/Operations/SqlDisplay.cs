using System.Globalization;
using System.Text.RegularExpressions;
using SqlAdmin.Core.Engines;
using SqlAdmin.Core.Execution;

namespace SqlAdmin.Core.Operations;

/// <summary>
/// The SQL of a plain (non-dynamic) operation with the DBA's values written in place of the
/// <c>@placeholders</c>, FOR READING ONLY. The real run never uses this text: it sends the template and
/// binds the values as parameters (which is what makes it injection-safe). The preview shows it because
/// "WHERE name = N'alice'" is easier to check than "WHERE name = @login_name".
/// </summary>
public static class SqlDisplay
{
    /// <summary>Shown instead of any password value, typed or generated.</summary>
    public const string PasswordMask = "N'***'";

    /// <summary>The operation's batches with every bound parameter replaced by a literal of its value.</summary>
    public static IReadOnlyList<string> Batches(
        OperationDefinition operation, IReadOnlyDictionary<string, string?> values, ISqlDialect dialect)
    {
        var rendered = TemplateRenderer.Render(operation, values, dialect);
        var passwords = operation.Params
            .Where(p => p.Type == OperationParameterType.Password)
            .Select(p => dialect.ParameterPrefix + p.Name)
            .ToHashSet(StringComparer.Ordinal);

        var sql = rendered.Sql;
        // Longest names first, so @login is never replaced inside @login_name.
        foreach (var (name, value) in rendered.Parameters.OrderByDescending(p => p.Name.Length))
        {
            var literal = passwords.Contains(name) ? PasswordMask : Literal(value);
            // The name must stand alone: not the tail of a longer identifier or of @@SPID-style globals,
            // and not followed by more identifier characters. The MatchEvaluator overload (a lambda) is
            // used so that "$" inside a value is never read as a regex replacement pattern.
            sql = Regex.Replace(sql, $@"(?<![\w@]){Regex.Escape(name)}(?!\w)", _ => literal);
        }

        return BatchSplitter.Split(sql, dialect.BatchSeparator);
    }

    /// <summary>A value as T-SQL text: numbers as they are, booleans as 1 / 0, text as N'...' with quotes doubled.</summary>
    internal static string Literal(object value) => value switch
    {
        int number => number.ToString(CultureInfo.InvariantCulture),
        bool flag => flag ? "1" : "0",
        _ => "N'" + (value.ToString() ?? "").Replace("'", "''") + "'",
    };
}
