using System.Security.Cryptography;

namespace SqlAdmin.Core.Operations;

/// <summary>
/// Generates passwords with <see cref="RandomNumberGenerator"/> (cryptographically secure —
/// <c>System.Random</c> is predictable and must never be used for secrets).
/// </summary>
public static class SecretGenerator
{
    // Letters, digits and a few symbols. No look-alikes (0/O, 1/l/I) and no quote or
    // backslash characters, so the password survives copy/paste and dynamic-SQL quoting.
    private const string Upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private const string Lower = "abcdefghijkmnopqrstuvwxyz";
    private const string Digits = "23456789";
    private const string Symbols = "!#$%&*+-=?@^_";
    private const string All = Upper + Lower + Digits + Symbols;

    public static string GeneratePassword(int length = 20)
    {
        if (length < 12) throw new ArgumentOutOfRangeException(nameof(length), "Use at least 12 characters.");

        // One character from each class first (satisfies SQL Server's complexity policy),
        // the rest from the full alphabet, then shuffle so the classes aren't in a fixed position.
        var chars = new List<char>(length)
        {
            Pick(Upper), Pick(Lower), Pick(Digits), Pick(Symbols),
        };
        while (chars.Count < length) chars.Add(Pick(All));

        RandomNumberGenerator.Shuffle(System.Runtime.InteropServices.CollectionsMarshal.AsSpan(chars));
        return new string(chars.ToArray());
    }

    // GetInt32 is unbiased (no modulo bias).
    private static char Pick(string alphabet) => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)];
}
