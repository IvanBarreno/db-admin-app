using System.Text.RegularExpressions;
using SqlAdmin.Core.Engines;

namespace SqlAdmin.Core.Operations;

/// <summary>Thrown when a required parameter is missing, or a value fails the identifier allow-list.</summary>
public sealed class TemplateRenderException(string message) : Exception(message);

/// <summary>
/// Turns an <see cref="OperationDefinition.Sql"/> template and a set of parameter values into
/// SQL text plus name/value pairs, ready to bind onto a command.
/// Two kinds of placeholder, by design — see §5 "Execution engine rules":
///   - <c>@name</c>            → a real parameter (names, passwords: never string-concatenated).
///   - <c>{{ident:name}}</c>   → inlined via <see cref="ISqlDialect.QuoteIdentifier"/> for things
///                               that cannot be parameters (database/role/schema names in DDL).
/// </summary>
public static class TemplateRenderer
{
    private static readonly Regex IdentPlaceholder = new(@"\{\{ident:(\w+)\}\}", RegexOptions.Compiled);

    // Conservative allow-list for anything inlined as an identifier: letters, digits,
    // underscore, dollar, hash — the characters SQL Server permits unquoted/quoted identifiers
    // to start a sane name with. This is a defence-in-depth belt alongside QuoteIdentifier,
    // not a replacement for it.
    private static readonly Regex IdentifierAllowList = new(@"^[A-Za-z_][A-Za-z0-9_$#]*$", RegexOptions.Compiled);

    public static RenderedTemplate Render(
        OperationDefinition operation,
        IReadOnlyDictionary<string, string?> values,
        ISqlDialect dialect)
    {
        foreach (var param in operation.Params.Where(p => p.Required))
        {
            if (!values.TryGetValue(param.Name, out var value) || string.IsNullOrWhiteSpace(value))
            {
                throw new TemplateRenderException($"Parameter '{param.Name}' is required.");
            }
        }

        var sql = IdentPlaceholder.Replace(operation.Sql, match =>
        {
            var name = match.Groups[1].Value;
            var value = values.GetValueOrDefault(name)
                ?? throw new TemplateRenderException($"Parameter '{name}' is required.");

            if (!IdentifierAllowList.IsMatch(value))
            {
                throw new TemplateRenderException(
                    $"Value for identifier parameter '{name}' contains characters that are not allowed.");
            }

            return dialect.QuoteIdentifier(value);
        });

        var parameters = new List<(string Name, object Value)>();
        foreach (var param in operation.Params)
        {
            // {{ident:...}} parameters were already inlined above; only bind the rest.
            if (operation.Sql.Contains($"{{{{ident:{param.Name}}}}}", StringComparison.Ordinal)) continue;
            if (!values.TryGetValue(param.Name, out var value) || value is null) continue;

            parameters.Add(($"{dialect.ParameterPrefix}{param.Name}", Convert(param, value)));
        }

        return new RenderedTemplate(sql, parameters);
    }

    private static object Convert(OperationParameter param, string value) => param.Type switch
    {
        OperationParameterType.Int => int.Parse(value),
        OperationParameterType.Bool => bool.Parse(value),
        _ => value,
    };
}

/// <summary>SQL text with placeholders resolved, plus the parameter name/value pairs to bind per batch.</summary>
public sealed record RenderedTemplate(string Sql, IReadOnlyList<(string Name, object Value)> Parameters);
