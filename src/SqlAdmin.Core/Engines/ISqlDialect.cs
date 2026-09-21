namespace SqlAdmin.Core.Engines;

/// <summary>
/// The handful of syntax details that differ between SQL products. Everything that inlines
/// an identifier into SQL text MUST go through <see cref="QuoteIdentifier"/> — it is the
/// only defence against injection for things that cannot be parameters (database, role
/// and schema names).
/// </summary>
public interface ISqlDialect
{
    /// <summary>
    /// Wraps a single identifier safely: T-SQL turns <c>my]db</c> into <c>[my]]db]</c>,
    /// Postgres would produce <c>"my""db"</c>. Never pass a dotted name — quote each part.
    /// </summary>
    string QuoteIdentifier(string identifier);

    /// <summary>Prefix for named parameters in SQL text: "@" for T-SQL, ":" or "$1" elsewhere.</summary>
    string ParameterPrefix { get; }

    /// <summary>Client-side batch separator keyword ("GO"), or null when the engine has none.</summary>
    string? BatchSeparator { get; }
}
