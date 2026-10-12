using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SqlAdmin.Infrastructure.Audit.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditLogSteps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "audit_log_steps",
                columns: table => new
                {
                    Id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    AuditEntryId = table.Column<long>(type: "INTEGER", nullable: false),
                    StepNo = table.Column<int>(type: "INTEGER", nullable: false),
                    Database = table.Column<string>(type: "TEXT", nullable: true),
                    Action = table.Column<string>(type: "TEXT", nullable: false),
                    Status = table.Column<string>(type: "TEXT", nullable: false),
                    RowsAffected = table.Column<int>(type: "INTEGER", nullable: true),
                    Message = table.Column<string>(type: "TEXT", nullable: true),
                    ExecutedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audit_log_steps", x => x.Id);
                    table.ForeignKey(
                        name: "FK_audit_log_steps_audit_log_AuditEntryId",
                        column: x => x.AuditEntryId,
                        principalTable: "audit_log",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_audit_log_steps_AuditEntryId",
                table: "audit_log_steps",
                column: "AuditEntryId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "audit_log_steps");
        }
    }
}
