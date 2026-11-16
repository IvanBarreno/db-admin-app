using System.Security.Cryptography;

namespace SqlAdmin.Core.Operations;

/// <summary>What a generated password should contain. Defaults match the old fixed behaviour.</summary>
/// <param name="Length">12 to 128 characters.</param>
/// <param name="Upper">Include A-Z.</param>
/// <param name="Lower">Include a-z.</param>
/// <param name="Digits">Include 0-9.</param>
/// <param name="Symbols">Include a small set of symbols (never quotes or backslash).</param>
/// <param name="ExcludeLookalikes">Leave out 0/O, 1/l/I so the password can be read aloud or retyped.</param>
public sealed record PasswordOptions(
    int Length = 20,
    bool Upper = true,
    bool Lower = true,
    bool Digits = true,
    bool Symbols = true,
    bool ExcludeLookalikes = true)
{
    public const int MinLength = 12;
    public const int MaxLength = 128;

    /// <summary>How many of the four character classes are on.</summary>
    public int ClassCount => new[] { Upper, Lower, Digits, Symbols }.Count(c => c);

    /// <summary>Why these options cannot produce a password, or null when they can.</summary>
    public string? Problem =>
        Length is < MinLength or > MaxLength ? $"Length must be between {MinLength} and {MaxLength}."
        : ClassCount == 0 ? "Choose at least one kind of character."
        : null;

    /// <summary>
    /// A heads-up (not an error) when the result may not satisfy SQL Server's CHECK_POLICY, which wants
    /// characters from at least 3 of the 4 classes. Null when fine.
    /// </summary>
    public string? PolicyWarning => ClassCount < 3
        ? "SQL logins with CHECK_POLICY ON need characters from at least 3 of: upper case, lower case, digits, symbols."
        : null;
}

/// <summary>
/// Generates passwords with <see cref="RandomNumberGenerator"/> (cryptographically secure —
/// <c>System.Random</c> is predictable and must never be used for secrets).
/// </summary>
public static class SecretGenerator
{
    // No quote or backslash characters in any class, so the password survives copy/paste and
    // dynamic-SQL quoting. The look-alike characters are added back only when asked for.
    private const string Upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private const string Lower = "abcdefghijkmnopqrstuvwxyz";
    private const string Digits = "23456789";
    private const string Symbols = "!#$%&*+-=?@^_";
    private const string UpperLookalikes = "IO";
    private const string LowerLookalikes = "l";
    private const string DigitLookalikes = "01";

    public static string GeneratePassword(int length = 20) => GeneratePassword(new PasswordOptions(length));

    public static string GeneratePassword(PasswordOptions options)
    {
        if (options.Problem is { } problem) throw new ArgumentOutOfRangeException(nameof(options), problem);

        var alphabets = new List<string>();
        if (options.Upper) alphabets.Add(options.ExcludeLookalikes ? Upper : Upper + UpperLookalikes);
        if (options.Lower) alphabets.Add(options.ExcludeLookalikes ? Lower : Lower + LowerLookalikes);
        if (options.Digits) alphabets.Add(options.ExcludeLookalikes ? Digits : Digits + DigitLookalikes);
        if (options.Symbols) alphabets.Add(Symbols);
        var all = string.Concat(alphabets);

        // One character from each chosen class first (so every ticked class is really present),
        // the rest from the combined alphabet, then shuffle so the classes aren't in a fixed position.
        var chars = new List<char>(options.Length);
        chars.AddRange(alphabets.Select(Pick));
        while (chars.Count < options.Length) chars.Add(Pick(all));

        RandomNumberGenerator.Shuffle(System.Runtime.InteropServices.CollectionsMarshal.AsSpan(chars));
        return new string(chars.ToArray());
    }

    // GetInt32 is unbiased (no modulo bias).
    private static char Pick(string alphabet) => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)];
}
