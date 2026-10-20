using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SqlAdmin.Infrastructure.Audit.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditLogParameters : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ParametersJson",
                table: "audit_log",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ParametersJson",
                table: "audit_log");
        }
    }
}
