/*
  02_cleanup_lab.sql — removes everything the offboarding lab created (databases, jobs, logins),
  whatever state the tests left it in. Safe to run any number of times. DEV server only.
*/
SET NOCOUNT ON;
GO

IF IS_SRVROLEMEMBER(N'sysadmin') <> 1
    THROW 50001, N'Run this script as a sysadmin.', 1;
IF @@SERVERNAME <> N'ivand'
    THROW 50001, N'Wrong server: edit the @@SERVERNAME guard if this is the intended DEV server.', 1;
GO

-- Databases (bring offline ones back online first; single-user kicks out open sessions).
DECLARE @sql nvarchar(max) = N'';
SELECT @sql += N'IF DATABASEPROPERTYEX(N''' + name + N''', ''Status'') = N''OFFLINE'' ALTER DATABASE ' + QUOTENAME(name) + N' SET ONLINE; '
             + N'ALTER DATABASE ' + QUOTENAME(name) + N' SET SINGLE_USER WITH ROLLBACK IMMEDIATE; '
             + N'DROP DATABASE ' + QUOTENAME(name) + N'; '
FROM sys.databases WHERE name LIKE N'zz[_]lab[_]%';
EXEC (@sql);

-- Jobs.
DECLARE @job sysname;
DECLARE jobs CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM msdb.dbo.sysjobs WHERE name LIKE N'zz[_]lab[_]%';
OPEN jobs; FETCH NEXT FROM jobs INTO @job;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC msdb.dbo.sp_delete_job @job_name = @job;
    FETCH NEXT FROM jobs INTO @job;
END
CLOSE jobs; DEALLOCATE jobs;

-- Sessions, then logins. A login that owns a database or job cannot be dropped, but both are gone by now.
SET @sql = N'';
SELECT @sql += N'KILL ' + CAST(session_id AS nvarchar(10)) + N'; '
FROM sys.dm_exec_sessions
WHERE login_name LIKE N'zz[_]%' AND is_user_process = 1 AND session_id <> @@SPID;
EXEC (@sql);

SET @sql = N'';
SELECT @sql += N'DROP LOGIN ' + QUOTENAME(name) + N'; '
FROM sys.server_principals WHERE type = 'S' AND name LIKE N'zz[_]%';
EXEC (@sql);
GO

SELECT 'databases left' AS what, COUNT(*) AS n FROM sys.databases WHERE name LIKE N'zz[_]lab[_]%'
UNION ALL SELECT 'jobs left', COUNT(*) FROM msdb.dbo.sysjobs WHERE name LIKE N'zz[_]lab[_]%'
UNION ALL SELECT 'logins left', COUNT(*) FROM sys.server_principals WHERE name LIKE N'zz[_]%' AND type = 'S';
GO
