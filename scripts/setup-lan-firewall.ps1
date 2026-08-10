#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$ruleName = "Energy Brawl LAN Server 3000-3010"
$rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

if ($null -eq $rule) {
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction Inbound `
        -Action Allow `
        -Profile Private `
        -Protocol TCP `
        -LocalPort "3000-3010" `
        -RemoteAddress LocalSubnet | Out-Null
} else {
    Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Profile Private -Direction Inbound -Action Allow
    $rule | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort "3000-3010"
    $rule | Get-NetFirewallAddressFilter | Set-NetFirewallAddressFilter -RemoteAddress LocalSubnet
}

Write-Host "Energy Brawl LAN firewall rule is ready." -ForegroundColor Green
Get-NetFirewallRule -DisplayName $ruleName | Format-List DisplayName, Enabled, Profile, Direction, Action
Get-NetFirewallRule -DisplayName $ruleName | Get-NetFirewallPortFilter | Format-List Protocol, LocalPort
Get-NetFirewallRule -DisplayName $ruleName | Get-NetFirewallAddressFilter | Format-List RemoteAddress
