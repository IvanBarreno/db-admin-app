using SqlAdmin.Core.Execution;

namespace SqlAdmin.Core.Tests;

public class BatchSplitterTests
{
    [Fact]
    public void Splits_on_go_lines_case_insensitive_with_whitespace()
    {
        var batches = BatchSplitter.Split("SELECT 1;\nGO\nSELECT 2;\n  go  \nSELECT 3;", "GO");

        Assert.Equal(3, batches.Count);
        Assert.Equal("SELECT 1;", batches[0].Trim());
        Assert.Equal("SELECT 3;", batches[2].Trim());
    }

    [Fact]
    public void Drops_empty_batches()
    {
        var batches = BatchSplitter.Split("GO\nSELECT 1;\nGO\nGO\n", "GO");

        Assert.Single(batches);
    }

    [Fact]
    public void Ignores_go_inside_string_literal()
    {
        var batches = BatchSplitter.Split("SELECT 'a\nGO\nb';", "GO");

        Assert.Single(batches);
    }

    [Fact]
    public void Ignores_go_inside_block_comment()
    {
        var batches = BatchSplitter.Split("/*\nGO\n*/\nSELECT 1;", "GO");

        Assert.Single(batches);
    }

    [Fact]
    public void Ignores_go_inside_bracketed_identifier()
    {
        var batches = BatchSplitter.Split("SELECT 1 AS [a\nGO\nb];", "GO");

        Assert.Single(batches);
    }

    [Fact]
    public void Go_as_part_of_a_word_is_not_a_separator()
    {
        var batches = BatchSplitter.Split("SELECT 1;\nGOTO x;\nSELECT 2;", "GO");

        Assert.Single(batches);
    }

    [Fact]
    public void Null_separator_returns_whole_script()
    {
        var batches = BatchSplitter.Split("SELECT 1;\nGO\nSELECT 2;", null);

        Assert.Single(batches);
    }
}
