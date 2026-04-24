Add-Type -AssemblyName "System.Data"

$conn = New-Object System.Data.SqlClient.SqlConnection
$conn.ConnectionString = "Server=localhost,1433;Database=master;Integrated Security=True;TrustServerCertificate=True"
$conn.Open()
Write-Host "Connected via Windows Auth"

$cmds = @(
    "EXEC xp_instance_regwrite N'HKEY_LOCAL_MACHINE', N'Software\Microsoft\MSSQLServer\MSSQLServer', N'LoginMode', REG_DWORD, 2",
    "ALTER LOGIN [sa] WITH PASSWORD = 'scan', CHECK_EXPIRATION = OFF, CHECK_POLICY = OFF",
    "ALTER LOGIN [sa] ENABLE"
)

foreach ($sql in $cmds) {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $sql
    $cmd.ExecuteNonQuery() | Out-Null
    Write-Host "OK: $($sql.Substring(0, [Math]::Min(60, $sql.Length)))"
}

$conn.Close()
Write-Host "sa login enabled. Restarting SQL Server..."
Restart-Service "MSSQL`$SQLEXPRESS" -Force
Write-Host "Done! Test with: sa / scan"
