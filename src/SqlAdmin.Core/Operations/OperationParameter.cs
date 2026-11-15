namespace SqlAdmin.Core.Operations;

/// <summary>Primitive kind of a parameter — drives both the generated <c>ParamForm</c> input and
/// how <see cref="TemplateRenderer"/> treats the value (bound as a value vs. quoted as an identifier).</summary>
public enum OperationParameterType
{
    /// <summary>Database/role/schema identifier name — safe only via <see cref="Engines.ISqlDialect.QuoteIdentifier"/>.</summary>
    Sysname,
    String,
    Int,
    Bool,
    /// <summary>Never logged in plain text; redacted in the audit trail.</summary>
    Password,
    /// <summary>One of <see cref="OperationParameter.Choices"/>.</summary>
    Choice,
    /// <summary>A database name on the target server, for a picker.</summary>
    Database,
    /// <summary>A login name on the target server, for a picker.</summary>
    Login,
    /// <summary>A user name in the selected database, for a picker (needs a database chosen).</summary>
    User,
}

/// <summary>One parameter an operation's template expects, described for validation and for the
/// frontend's generic <c>ParamForm</c> to render the right input.</summary>
public sealed record OperationParameter
{
    public required string Name { get; init; }
    public required OperationParameterType Type { get; init; }
    public bool Required { get; init; } = true;
    public string? Default { get; init; }
    public IReadOnlyList<string>? Choices { get; init; }

    /// <summary>
    /// Password parameters only: when the DBA leaves the field blank the server generates a strong
    /// password (<see cref="SecretGenerator"/>), uses it, and returns it once in the execute response.
    /// </summary>
    public bool Generate { get; init; }

    /// <summary>
    /// Id of a lookup (<c>lookups/*.yaml</c>) that lists the valid values from the server. The UI
    /// shows them as suggestions; with <see cref="MustExist"/> they become the only accepted values.
    /// Null falls back to the implicit source of the type (see <see cref="EffectiveSource"/>).
    /// </summary>
    public string? Source { get; init; }

    /// <summary>Names of OTHER parameters whose current values the lookup needs (bound to its args by the same name).</summary>
    public IReadOnlyList<string>? DependsOn { get; init; }

    /// <summary>True: the value must appear in the lookup — checked in the form and again on the server.</summary>
    public bool MustExist { get; init; }

    /// <summary>
    /// A list of values from the <see cref="Source"/> lookup, ticked in a checklist. Travels as a JSON array of
    /// strings in the same string slot as every other value, is bound as one JSON parameter (<c>OPENJSON(@name)</c>
    /// in the script), and is normalised (distinct, sorted) so a confirm token binds to the SELECTION, not its order.
    /// </summary>
    public bool Multi { get; init; }

    /// <summary>
    /// Multi only. Pre-tick everything the lookup returns (the UI shows all ticked until the DBA unticks some).
    /// An empty list then means "all", which is what a script that filters on the list expects.
    /// </summary>
    public bool DefaultAll { get; init; }

    /// <summary>
    /// Two multi parameters with the same group (one <c>add</c>, one <c>drop</c>) are shown as ONE checklist whose
    /// ticks start from the lookup's <c>is_member</c> column; the form sends only the difference (what to add, what to drop).
    /// </summary>
    public string? ChecklistGroup { get; init; }

    /// <summary><c>add</c> or <c>drop</c>: which side of the diff this parameter receives.</summary>
    public string? ChecklistAction { get; init; }

    /// <summary>Preselects a value (typically a Choice) from the current state of the server; see <see cref="ParameterSuggestion"/>.</summary>
    public ParameterSuggestion? Suggest { get; init; }

    /// <summary>Human label for the field; null = the form derives one from the name (<c>login_name</c> → "login name").</summary>
    public string? Label { get; init; }

    /// <summary>What this field is for, shown as a tooltip and under the field. Filled from the YAML or the shared glossary.</summary>
    public string? Help { get; init; }

    /// <summary>Choice only: what each choice does (<c>DISABLE</c> → "Blocks the login from connecting…"), shown as option tooltips.</summary>
    public IReadOnlyDictionary<string, string>? ChoiceHelp { get; init; }

    /// <summary>
    /// Login / user parameters only. True (default): the principal is being CHANGED by the operation, so a protected
    /// login (the one the app connects with, or one listed in <c>ProtectedLogins</c>) is refused. False for a login
    /// that merely RECEIVES something, such as the new owner of databases or jobs.
    /// </summary>
    public bool Protect { get; init; } = true;

    /// <summary>Shown inside a collapsed "Advanced" section of the form (optional refinements).</summary>
    public bool Advanced { get; init; }

    /// <summary>
    /// A lookup of prefixes to offer as click-to-insert chips (e.g. <c>windows_domains</c> → "CONTOSO\"), for names
    /// that must be written as <c>PREFIX\name</c>.
    /// </summary>
    public string? PrefixLookup { get; init; }

    /// <summary>
    /// Rules that show some lookup items LOCKED (visible, not pickable) with a reason: Windows logins on a password
    /// reset, logins already in the wanted state, offline databases. UX only — the script and its checks still guard the run.
    /// </summary>
    public IReadOnlyList<LockRule>? LockWhen { get; init; }

    /// <summary>The lookup that feeds this parameter: explicit <c>source:</c>, else implied by Login/User/Database.</summary>
    public string? EffectiveSource => Source ?? Type switch
    {
        OperationParameterType.Login => "logins",
        OperationParameterType.User => "users",
        OperationParameterType.Database => "databases",
        _ => null,
    };
}

/// <summary>
/// Locks a lookup item when its <paramref name="Column"/> (text form: "true"/"false" for booleans) is in
/// <paramref name="Values"/> — or, with <paramref name="Not"/>, when it is NOT in them. If <paramref name="IfParam"/>
/// is set the rule only applies while that other parameter has the value <paramref name="IfValue"/>
/// (e.g. lock "already disabled" logins only while the action is DISABLE).
/// </summary>
public sealed record LockRule(
    string Column,
    IReadOnlyList<string> Values,
    bool Not,
    string Reason,
    string? IfParam,
    string? IfValue);

/// <summary>
/// "Ask the server, then propose a value": the form runs <paramref name="Lookup"/> (with the values of
/// <paramref name="DependsOn"/> as args), reads <paramref name="Column"/> of the first row, and maps its text
/// through <paramref name="Map"/> to a value for the parameter — e.g. <c>is_disabled</c> "true" → ENABLE, so an
/// already-disabled login is offered ENABLE and not DISABLE. It only fills a field the DBA has not touched.
/// </summary>
public sealed record ParameterSuggestion(
    string Lookup,
    string Column,
    IReadOnlyList<string> DependsOn,
    IReadOnlyDictionary<string, string> Map);
