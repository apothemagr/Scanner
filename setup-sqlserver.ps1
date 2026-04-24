# Enable TCP/IP for SQLEXPRESS and set static port 1433
$tcpPath = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL17.SQLEXPRESS\MSSQLServer\SuperSocketNetLib\Tcp"
$ipAllPath = "$tcpPath\IPAll"

Set-ItemProperty -Path $tcpPath -Name "Enabled" -Value 1
Write-Host "TCP/IP enabled"

if (Test-Path $ipAllPath) {
    Set-ItemProperty -Path $ipAllPath -Name "TcpPort" -Value "1433"
    Set-ItemProperty -Path $ipAllPath -Name "TcpDynamicPorts" -Value ""
    Write-Host "Port 1433 set"
}

# Enable Mixed Mode Auth and set sa password
$saSetup = @"
ALTER LOGIN [sa] ENABLE;
ALTER LOGIN [sa] WITH PASSWORD = 'scan';
EXEC xp_instance_regwrite N'HKEY_LOCAL_MACHINE', N'Software\Microsoft\MSSQLServer\MSSQLServer', N'LoginMode', REG_DWORD, 2;
"@

$saSetup | & "sqlcmd" -S ".\SQLEXPRESS" -E -Q $saSetup 2>&1
Write-Host "sa login configured"

# Restart SQL Server service
Restart-Service "MSSQL`$SQLEXPRESS" -Force
Write-Host "SQL Server restarted"
Start-Sleep -Seconds 3

# Create scanner_db
& "sqlcmd" -S "localhost,1433" -U "sa" -P "scan" -Q "IF DB_ID('scanner_db') IS NULL CREATE DATABASE scanner_db" 2>&1
Write-Host "Database scanner_db ready"
Write-Host "DONE"
