using System.Text.Json;

namespace SqlAdmin.Core.Operations;

/// <summary>
/// Helpers for <see cref="OperationParameter.Multi"/> values. A list travels as a JSON array of strings
/// (<c>["db_datareader","db_datawriter"]</c>) in the same string slot as any other parameter value.
/// </summary>
public static class MultiValues
{
    /// <summary>
    /// What the form sends for a <see cref="OperationParameter.DefaultAll"/> list when the DBA unticks EVERYTHING.
    /// An empty list means "all" for those parameters, so "none" needs its own value: it matches no item, so scripts
    /// and the all_databases filter process nothing, and <c>must_exist</c> rejects it with a clear message.
    /// </summary>
    public const string NoneSentinel = "(none)";

    public const int MaxItems = 1000;
    public const int MaxItemLength = 256;

    /// <summary>Items of a list value; blank or missing = empty list.</summary>
    /// <exception cref="TemplateRenderException">Not a JSON array of strings, too many items, or an item that is too long.</exception>
    public static IReadOnlyList<string> Parse(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return [];

        string[]? items;
        try
        {
            items = JsonSerializer.Deserialize<string[]>(value);
        }
        catch (JsonException)
        {
            throw new TemplateRenderException("A list value must be a JSON array of strings.");
        }

        var clean = (items ?? []).Select(i => i?.Trim() ?? "").Where(i => i.Length > 0).ToList();
        if (clean.Count > MaxItems) throw new TemplateRenderException($"A list can have at most {MaxItems} items.");
        if (clean.Any(i => i.Length > MaxItemLength)) throw new TemplateRenderException($"A list item is longer than {MaxItemLength} characters.");
        return clean;
    }

    /// <summary>The same list, trimmed, de-duplicated and sorted — so equal selections give equal text (and equal confirm tokens).</summary>
    public static string Canonical(IEnumerable<string> items) =>
        JsonSerializer.Serialize(items.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray());

    public static bool IsEmpty(string? value) => Parse(value).Count == 0;

    /// <summary>
    /// A copy of <paramref name="values"/> where every list parameter is canonical (blank becomes <c>[]</c>), so scripts
    /// always have a bound JSON array and callers can compare or sign the text.
    /// </summary>
    public static Dictionary<string, string?> Normalize(
        IEnumerable<OperationParameter> declared, IReadOnlyDictionary<string, string?> values)
    {
        var result = new Dictionary<string, string?>(values);
        foreach (var param in declared.Where(p => p.Multi))
            result[param.Name] = Canonical(Parse(values.GetValueOrDefault(param.Name)));
        return result;
    }
}
