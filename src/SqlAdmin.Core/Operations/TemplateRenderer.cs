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

    /// <summary>
    /// <c>{{exec:@sql}}</c> — "run the statement text held in @sql". It expands to a branch on the
    /// <c>@dry_run</c> parameter: when 1 the text is only SELECTed (as a <c>statement</c> column), otherwise
    /// it is EXECuted. Scripts therefore build their statements in one place and the preview shows exactly
    /// what execute will run — the only difference is this last branch.
    /// </summary>
    private static readonly Regex ExecMacro = new(@"\{\{exec:(@\w+)\}\}", RegexOptions.Compiled);

    /// <summary>Stand-in for password values in a dry run: the statement shape matters, the secret never does.</summary>
    public const string DryRunPasswordMask = "***";

    /// <param name="operation">The operation whose template is rendered.</param>
    /// <param name="supplied">Parameter values as the DBA typed them, keyed by parameter name.</param>
    /// <param name="dialect">Quoting and parameter-prefix rules of the target engine.</param>
    /// <param name="dryRun">
    /// True: <c>@dry_run</c> is bound to 1, so <c>{{exec:...}}</c> scripts return their statements instead of
    /// running them. Password values are replaced by a mask so they cannot leak into the preview.
    /// </param>
    public static RenderedTemplate Render(
        OperationDefinition operation,
        IReadOnlyDictionary<string, string?> supplied,
        ISqlDialect dialect,
        bool dryRun = false)
    {
        // Blank or missing values fall back to the YAML default, so optional parameters
        // (e.g. a bool flag the DBA left on "—") are always bound and the SQL never meets an
        // undeclared @variable.
        // List parameters become canonical JSON arrays (blank = "[]") so OPENJSON(@name) always has input.
        var values = MultiValues.Normalize(operation.Params, supplied);
        if (dryRun)
        {
            foreach (var password in operation.Params.Where(p => p.Type == OperationParameterType.Password))
                values[password.Name] = DryRunPasswordMask;
        }
        foreach (var param in operation.Params.Where(p => p.Default is not null))
        {
            if (string.IsNullOrWhiteSpace(values.GetValueOrDefault(param.Name))) values[param.Name] = param.Default;
        }

        foreach (var param in operation.Params.Where(p => p.Required))
        {
            if (!values.TryGetValue(param.Name, out var value) || string.IsNullOrWhiteSpace(value)
                || (param.Multi && MultiValues.IsEmpty(value)))
            {
                throw new TemplateRenderException(param.Multi
                    ? $"Choose at least one item for '{param.Name}'."
                    : $"Parameter '{param.Name}' is required.");
            }
        }

        // A Choice value must be one of the declared choices. Templates may therefore concatenate
        // it into dynamic SQL (e.g. GRANT <permission> ...) because it can only ever be a
        // string the YAML author wrote.
        foreach (var param in operation.Params.Where(p => p.Type == OperationParameterType.Choice))
        {
            var value = values.GetValueOrDefault(param.Name);
            if (!string.IsNullOrWhiteSpace(value) && param.Choices?.Contains(value) != true)
            {
                throw new TemplateRenderException(
                    $"Value for '{param.Name}' must be one of: {string.Join(", ", param.Choices ?? [])}.");
            }
        }

        var template = ExecMacro.Replace(operation.Sql, m =>
            $"IF @dry_run = 1 SELECT ISNULL(NULLIF({m.Groups[1].Value}, N''), N'-- nothing to do') AS statement ELSE EXEC ({m.Groups[1].Value})");

        var sql = IdentPlaceholder.Replace(template, match =>
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

        if (template.Contains("@dry_run", StringComparison.Ordinal))
            parameters.Add(($"{dialect.ParameterPrefix}dry_run", dryRun));

        return new RenderedTemplate(sql, parameters);
    }

    // TryParse instead of Parse: a value typed by a person ("abc" in a number field) must come back as a
    // 400 "Invalid parameters" naming the field, not as an unhandled FormatException (a generic 500).
    private static object Convert(OperationParameter param, string value) => param.Type switch
    {
        OperationParameterType.Int => int.TryParse(value.Trim(), System.Globalization.NumberStyles.Integer,
                System.Globalization.CultureInfo.InvariantCulture, out var number)
            ? number
            : throw new TemplateRenderException($"Parameter '{param.Name}' must be a whole number."),
        OperationParameterType.Bool => bool.TryParse(value.Trim(), out var flag)
            ? flag
            : throw new TemplateRenderException($"Parameter '{param.Name}' must be true or false."),
        _ => value,
    };
}

/// <summary>SQL text with placeholders resolved, plus the parameter name/value pairs to bind per batch.</summary>
public sealed record RenderedTemplate(string Sql, IReadOnlyList<(string Name, object Value)> Parameters);
