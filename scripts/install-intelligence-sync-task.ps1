[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$WorkingDirectory,
  [Parameter(Mandatory = $true)][string]$NodeExecutable
)

$taskName = "Mayday Dispatch Intelligence Sync"
$command = "& `"$NodeExecutable`" `"$WorkingDirectory\node_modules\tsx\dist\cli.mjs`" `"$WorkingDirectory\scripts\intelligence-worker.ts`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -Command $command"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit (New-TimeSpan -Days 365)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Supervised bounded Dispatch Intelligence synchronization worker." -Force
Write-Output "Installed $taskName. This script does not start the task."
