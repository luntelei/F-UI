param(
  [switch]$SkipDeploy,
  [switch]$Reconfigure
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$workerDir = Join-Path $root 'f-worker'
$wranglerToml = Join-Path $workerDir 'wrangler.toml'
$wranglerTomlExample = Join-Path $workerDir 'wrangler.toml.example'
$setupStateDir = Join-Path $root '.wrangler'
$setupStatePath = Join-Path $setupStateDir 'setup-cloudflare-state.json'

function Get-WranglerCommand {
  $localWrangler = Join-Path $workerDir 'node_modules\.bin\wrangler.cmd'
  if (Test-Path -LiteralPath $localWrangler) {
    return '"' + $localWrangler + '"'
  }
  return 'npx wrangler'
}

function Invoke-Wrangler {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  $localWrangler = Join-Path $workerDir 'node_modules\.bin\wrangler.cmd'
  if (Test-Path -LiteralPath $localWrangler) {
    & $localWrangler @Arguments
  } else {
    & npx wrangler @Arguments
  }
}

function New-SetupState {
  [pscustomobject]@{
    version    = 1
    updated_at = ''
    steps      = [pscustomobject]@{}
    values     = [pscustomobject]@{}
  }
}

function Ensure-ObjectProperty {
  param(
    [Parameter(Mandatory = $true)]$Object,
    [Parameter(Mandatory = $true)][string]$Name,
    $Value
  )

  $property = $Object.PSObject.Properties[$Name]
  if ($property) {
    $property.Value = $Value
  } else {
    $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
  }
}

function Read-SetupState {
  if (!(Test-Path -LiteralPath $setupStatePath)) {
    return New-SetupState
  }

  try {
    $state = Get-Content -LiteralPath $setupStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    Write-Host "续跑状态文件无法读取，将重新生成：$setupStatePath" -ForegroundColor Yellow
    return New-SetupState
  }

  if (!$state.steps) {
    Ensure-ObjectProperty $state 'steps' ([pscustomobject]@{})
  }
  if (!$state.values) {
    Ensure-ObjectProperty $state 'values' ([pscustomobject]@{})
  }
  return $state
}

function Save-SetupState {
  if (!(Test-Path -LiteralPath $setupStateDir)) {
    New-Item -ItemType Directory -Path $setupStateDir | Out-Null
  }
  Ensure-ObjectProperty $script:setupState 'updated_at' ([DateTime]::UtcNow.ToString('o'))
  $script:setupState | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $setupStatePath -Encoding UTF8
}

function Test-SetupStep {
  param([Parameter(Mandatory = $true)][string]$Name)
  $property = $script:setupState.steps.PSObject.Properties[$Name]
  return ($property -and $property.Value -eq $true)
}

function Set-SetupStep {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [bool]$Completed = $true
  )
  Ensure-ObjectProperty $script:setupState.steps $Name $Completed
  Save-SetupState
}

function Set-SetupValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [AllowNull()]$Value
  )
  Ensure-ObjectProperty $script:setupState.values $Name $Value
  Save-SetupState
}

function Get-SetupValue {
  param([Parameter(Mandatory = $true)][string]$Name)
  $property = $script:setupState.values.PSObject.Properties[$Name]
  if ($property) { return $property.Value }
  return ''
}

function Read-Text {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [string]$Default = '',
    [switch]$Required
  )

  while ($true) {
    if ($Default) {
      $value = Read-Host "$Prompt [$Default]"
      if ($null -eq $value -or [string]::IsNullOrWhiteSpace([string]$value)) {
        $value = $Default
      }
    } else {
      $value = Read-Host $Prompt
      if ($null -eq $value) {
        $value = ''
      }
    }

    $value = [string]$value
    if (!$Required -or ![string]::IsNullOrWhiteSpace($value)) {
      return $value.Trim()
    }
    Write-Host '该项不能为空，请重新输入。' -ForegroundColor Yellow
  }
}

function Read-Choice {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [Parameter(Mandatory = $true)][string[]]$Labels,
    [int]$Default = 1
  )

  while ($true) {
    Write-Host $Prompt -ForegroundColor Cyan
    for ($i = 0; $i -lt $Labels.Count; $i++) {
      Write-Host ("  {0}. {1}" -f ($i + 1), $Labels[$i])
    }
    $value = Read-Host "请输入序号 [$Default]"
    if ($null -eq $value -or [string]::IsNullOrWhiteSpace([string]$value)) {
      $value = $Default
    }
    $n = 0
    if ([int]::TryParse(([string]$value).Trim(), [ref]$n) -and $n -ge 1 -and $n -le $Labels.Count) {
      return $n
    }
    Write-Host '请输入有效序号。' -ForegroundColor Yellow
  }
}

function Read-RequiredText {
  param([Parameter(Mandatory = $true)][string]$Prompt, [string]$Default = '')
  return Read-Text $Prompt $Default -Required
}

function Read-SecretText {
  param([Parameter(Mandatory = $true)][string]$Prompt)

  while ($true) {
    $secure = Read-Host $Prompt -AsSecureString
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
      [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    )
    if (![string]::IsNullOrWhiteSpace($plain)) {
      return $plain.Trim()
    }
    Write-Host '该项不能为空，请重新输入。' -ForegroundColor Yellow
  }
}

function Read-MinLengthSecretText {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [int]$MinLength = 32
  )

  while ($true) {
    $value = Read-SecretText $Prompt
    if ($value.Length -ge $MinLength) {
      return $value
    }
    Write-Host "长度不能少于 $MinLength 位，请重新输入。" -ForegroundColor Yellow
  }
}

function New-RandomSecret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
  } finally {
    $rng.Dispose()
  }
}

function Set-WranglerSecret {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $localWrangler = Join-Path $workerDir 'node_modules\.bin\wrangler.cmd'
  if (Test-Path -LiteralPath $localWrangler) {
    $Value | & $localWrangler secret put $Name
  } else {
    $Value | & npx wrangler secret put $Name
  }
}

function Assert-CloudflareResourceName {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if ($Name -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]*$') {
    throw "$Label 名称无效：$Name。名称必须以字母或数字开头，只能包含字母、数字、连字符和下划线。"
  }
}

function Escape-Toml {
  param([string]$Value)
  $escaped = [string]$Value
  $escaped = $escaped.Replace('\', '\\')
  $escaped = $escaped.Replace('"', '\"')
  return $escaped
}

function Get-TopValue {
  param([string]$Text, [string]$Key)
  $pattern = '(?m)^' + [regex]::Escape($Key) + '\s*=\s*"([^"]*)"'
  $m = [regex]::Match($Text, $pattern)
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}

function Get-VarValue {
  param([string]$Text, [string]$Key)
  $vars = [regex]::Match($Text, '(?ms)^\[vars\]\s*(.*?)(?=^\[|\z)')
  if (!$vars.Success) { return '' }
  $pattern = '(?m)^' + [regex]::Escape($Key) + '\s*=\s*"([^"]*)"'
  $m = [regex]::Match($vars.Groups[1].Value, $pattern)
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}

function Get-RouteDomain {
  param([string]$Text)
  $m = [regex]::Match($Text, 'pattern\s*=\s*"([^"]+)"')
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}

function Get-FirstBlockValue {
  param([string]$Text, [string]$BlockHeader, [string]$Key)
  $blockPattern = '(?ms)^\[\[' + [regex]::Escape($BlockHeader) + '\]\]\s*(.*?)(?=^\[\[|^\[|\z)'
  $block = [regex]::Match($Text, $blockPattern)
  if (!$block.Success) { return '' }
  $pattern = '(?m)^' + [regex]::Escape($Key) + '\s*=\s*"([^"]*)"'
  $m = [regex]::Match($block.Groups[1].Value, $pattern)
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}

function Set-TopValue {
  param([string]$Text, [string]$Key, [string]$Value)
  $line = $Key + ' = "' + (Escape-Toml $Value) + '"'
  $pattern = '(?m)^' + [regex]::Escape($Key) + '\s*='
  $linePattern = '(?m)^' + [regex]::Escape($Key) + '\s*=.*$'
  if ($Text -match $pattern) {
    return [regex]::Replace($Text, $linePattern, $line)
  }
  return "$line`r`n$Text"
}

function Set-Or-Remove-TopValue {
  param([string]$Text, [string]$Key, [string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    $linePattern = '(?m)^' + [regex]::Escape($Key) + '\s*=.*\r?\n?'
    return [regex]::Replace($Text, $linePattern, '')
  }
  return Set-TopValue $Text $Key $Value
}

function Set-VarValue {
  param([string]$Text, [string]$Key, [string]$Value)
  $line = $Key + ' = "' + (Escape-Toml $Value) + '"'
  if ($Text -notmatch '(?m)^\[vars\]') {
    $Text = "$Text`r`n[vars]`r`n"
  }
  $vars = [regex]::Match($Text, '(?ms)^\[vars\]\s*(.*?)(?=^\[|\z)')
  $body = $vars.Groups[1].Value
  $pattern = '(?m)^' + [regex]::Escape($Key) + '\s*='
  $linePattern = '(?m)^' + [regex]::Escape($Key) + '\s*=.*$'
  if ($body -match $pattern) {
    $body = [regex]::Replace($body, $linePattern, $line)
  } else {
    $body = $body.TrimEnd() + "`r`n$line`r`n"
  }
  return $Text.Substring(0, $vars.Index) + "[vars]`r`n" + $body.TrimEnd() + "`r`n`r`n" + $Text.Substring($vars.Index + $vars.Length).TrimStart()
}

function Set-RouteDomain {
  param([string]$Text, [string]$Domain)
  $escapedDomain = Escape-Toml $Domain
  $routes = @(
    '[[routes]]'
    'pattern = "' + $escapedDomain + '"'
    'custom_domain = true'
  ) -join "`r`n"
  if ($Text -match '(?ms)^\[\[routes\]\]\s*.*?(?=^\[|\z)') {
    return [regex]::Replace($Text, '(?ms)^\[\[routes\]\]\s*.*?(?=^\[|\z)', "$routes`r`n`r`n")
  }
  if ($Text -match '(?ms)^routes\s*=\s*\[.*?\]\s*') {
    return [regex]::Replace($Text, '(?ms)^routes\s*=\s*\[.*?\]\s*', "$routes`r`n`r`n")
  }
  $afterWorkersDev = '(?m)^workers_dev\s*=.*$'
  if ($Text -match $afterWorkersDev) {
    return [regex]::Replace($Text, $afterWorkersDev, "`$0`r`n`r`n$routes")
  }
  return "$Text`r`n$routes`r`n"
}

function Set-BlockValue {
  param([string]$Text, [string]$BlockHeader, [string]$Key, [string]$Value)
  $blockPattern = '(?ms)^\[\[' + [regex]::Escape($BlockHeader) + '\]\]\s*(.*?)(?=^\[\[|^\[|\z)'
  $block = [regex]::Match($Text, $blockPattern)
  if (!$block.Success) {
    throw "wrangler.toml 中缺少 [[$BlockHeader]] 配置块。"
  }
  $body = $block.Groups[1].Value
  $line = $Key + ' = "' + (Escape-Toml $Value) + '"'
  $pattern = '(?m)^' + [regex]::Escape($Key) + '\s*='
  $linePattern = '(?m)^' + [regex]::Escape($Key) + '\s*=.*$'
  if ($body -match $pattern) {
    $body = [regex]::Replace($body, $linePattern, $line)
  } else {
    $body = $body.TrimEnd() + "`r`n$line`r`n"
  }
  return $Text.Substring(0, $block.Index) + "[[$BlockHeader]]`r`n" + $body.TrimEnd() + "`r`n`r`n" + $Text.Substring($block.Index + $block.Length).TrimStart()
}

function Invoke-Step {
  param([Parameter(Mandatory = $true)][scriptblock]$Block)
  & $Block
  if ($LASTEXITCODE) {
    exit $LASTEXITCODE
  }
}

function Invoke-CaptureCmd {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [string]$WorkingDirectory = $root
  )
  $result = Invoke-CaptureCmdResult -Command $Command -WorkingDirectory $WorkingDirectory
  if ($result.ExitCode -ne 0) {
    Write-Host $result.Text
    exit $result.ExitCode
  }
  return $result.Text
}

function Invoke-CaptureCmdResult {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [string]$WorkingDirectory = $root
  )
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'cmd.exe'
  $psi.Arguments = '/d /c ' + $Command
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
  $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8

  $p = [System.Diagnostics.Process]::new()
  $p.StartInfo = $psi
  [void]$p.Start()
  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()

  $text = (($stdout, $stderr) | Where-Object { $_ }) -join "`n"
  return [pscustomobject]@{
    ExitCode = $p.ExitCode
    Text     = $text
  }
}

function Test-WranglerSession {
  $result = Invoke-CaptureCmdResult -Command "$(Get-WranglerCommand) whoami" -WorkingDirectory $root
  if (![string]::IsNullOrWhiteSpace($result.Text)) {
    Write-Host $result.Text
  }
  if ($result.ExitCode -ne 0) {
    return $false
  }
  return ($result.Text -notmatch 'You are not authenticated|Please run `?wrangler login`?')
}

function Assert-WranglerSession {
  if (!(Test-WranglerSession)) {
    throw 'Wrangler 登录验证失败，请重新运行脚本并完成 Cloudflare 登录。'
  }
}

function Get-WranglerAccountId {
  $out = Invoke-CaptureCmd "$(Get-WranglerCommand) whoami"
  $matches = [regex]::Matches($out, '\b[0-9a-fA-F]{32}\b')
  if ($matches.Count -gt 0) {
    return $matches[0].Value
  }
  return ''
}

function Get-DefaultZoneName {
  param([Parameter(Mandatory = $true)][string]$HostName)

  $name = (Normalize-DomainName $HostName)
  $parts = $name.Split('.') | Where-Object { $_ }
  if ($parts.Count -le 2) {
    return $name
  }
  return ($parts | Select-Object -Skip 1) -join '.'
}

function Normalize-DomainName {
  param([string]$Value)

  $name = ([string]$Value).Trim().TrimEnd('.').ToLowerInvariant()
  if ($name -notmatch '^[a-z0-9][a-z0-9.-]*[a-z0-9]$' -or $name -notmatch '\.') {
    throw "域名格式无效：$Value"
  }
  return $name
}

function Get-CloudflareApiToken {
  if (![string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
    return $env:CLOUDFLARE_API_TOKEN
  }

  Write-Host ''
  Write-Host '管理域名需要 Cloudflare API Token。' -ForegroundColor Cyan
  Write-Host '获取方式：Cloudflare 控制台 -> My Profile -> API Tokens -> Create Token。'
  Write-Host '请添加下面这些权限：' -ForegroundColor Cyan
  Write-Host '  1. Account -> Workers Scripts -> Edit'
  Write-Host '  2. Zone -> Workers Routes -> Edit'
  Write-Host '  3. Account -> Workers KV Storage -> Edit'
  Write-Host '  4. Account -> D1 -> Edit'
  Write-Host '  5. Zone -> Zone -> Edit'
  Write-Host '  6. Zone -> DNS -> Edit'
  Write-Host '资源范围：Account Resources 选择当前账号；Zone Resources 选择 All zones。' -ForegroundColor Cyan
  Write-Host '注意：如果要让脚本添加新域名到 Cloudflare，必须有 Zone -> Zone -> Edit。只有 Zone -> DNS -> Edit 不够。' -ForegroundColor Yellow
  $token = Read-SecretText '请粘贴 Cloudflare API Token'
  $env:CLOUDFLARE_API_TOKEN = $token
  return $token
}

function Invoke-CloudflareApi {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Token,
    [object]$Body = $null
  )

  $uri = 'https://api.cloudflare.com/client/v4' + $Path
  $headers = @{
    Authorization = "Bearer $Token"
    'Content-Type' = 'application/json'
  }

  try {
    if ($null -eq $Body) {
      $response = Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -TimeoutSec 60
    } else {
      $json = $Body | ConvertTo-Json -Depth 10
      $response = Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -Body $json -TimeoutSec 60
    }
  } catch {
    $statusCode = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }

    if ($statusCode -eq 403) {
      throw "Cloudflare API 请求被拒绝：Token 权限不足或资源范围不对。请确认包含 Zone -> Zone -> Edit、Zone -> DNS -> Edit、Zone -> Workers Routes -> Edit，并且 Zone Resources 选择 All zones。"
    }

    throw "Cloudflare API 请求失败：$($_.Exception.Message)"
  }

  if ($response.success -ne $true) {
    $message = '未知错误'
    if ($response.errors) {
      $message = (($response.errors | ForEach-Object { $_.message }) -join '；')
    }
    throw "Cloudflare API 返回失败：$message"
  }

  return $response.result
}

function Get-CloudflareZone {
  param(
    [Parameter(Mandatory = $true)][string]$ZoneName,
    [Parameter(Mandatory = $true)][string]$AccountId,
    [Parameter(Mandatory = $true)][string]$Token
  )

  $encodedName = [System.Uri]::EscapeDataString($ZoneName)
  $result = Invoke-CloudflareApi 'GET' "/zones?name=$encodedName&per_page=50" $Token
  foreach ($zone in @($result)) {
    if ($zone.name -eq $ZoneName -and (!$AccountId -or $zone.account.id -eq $AccountId)) {
      return $zone
    }
  }
  return $null
}

function Ensure-CloudflareZone {
  param(
    [Parameter(Mandatory = $true)][string]$ZoneName,
    [Parameter(Mandatory = $true)][string]$AccountId,
    [Parameter(Mandatory = $true)][string]$Token
  )

  $existing = Get-CloudflareZone $ZoneName $AccountId $Token
  if ($existing) {
    Write-Host "已找到 Cloudflare Zone：$ZoneName（状态：$($existing.status)）" -ForegroundColor Green
    return $existing
  }

  Write-Host "正在把根域名添加到 Cloudflare：$ZoneName" -ForegroundColor Cyan
  $body = @{
    name = $ZoneName
    account = @{ id = $AccountId }
    type = 'full'
  }
  $zone = Invoke-CloudflareApi 'POST' '/zones' $Token $body
  Write-Host "已创建 Cloudflare Zone：$ZoneName" -ForegroundColor Green
  return $zone
}

function Show-CloudflareNameservers {
  param([Parameter(Mandatory = $true)]$Zone)

  $servers = @($Zone.name_servers)
  if (!$servers.Count) {
    Write-Host '暂未获取到 Cloudflare 分配的 NS，请稍后在 Cloudflare 域名页面查看。' -ForegroundColor Yellow
    return
  }

  Write-Host ''
  Write-Host '请到域名注册商后台，把 NS 服务器改成下面两条：' -ForegroundColor Cyan
  foreach ($server in $servers) {
    Write-Host "  $server"
  }
}

function Wait-CloudflareZoneActive {
  param(
    [Parameter(Mandatory = $true)][string]$ZoneId,
    [Parameter(Mandatory = $true)][string]$ZoneName,
    [Parameter(Mandatory = $true)][string]$Token
  )

  $zone = Invoke-CloudflareApi 'GET' "/zones/$ZoneId" $Token
  if ($zone.status -eq 'active') {
    Write-Host "域名已接入 Cloudflare：$ZoneName" -ForegroundColor Green
    return $zone
  }

  Show-CloudflareNameservers $zone
  $choice = Read-Choice "Cloudflare 当前显示域名状态为 $($zone.status)，请选择" @(
    '我已在注册商修改 NS，等待脚本检测'
    '先继续部署，稍后我自己处理 NS'
    '退出脚本'
  ) 1

  if ($choice -eq 3) {
    exit 0
  }
  if ($choice -eq 2) {
    return $zone
  }

  for ($i = 1; $i -le 6; $i++) {
    Write-Host "等待 Cloudflare 接入检测，第 $i/6 次，30 秒后重试..."
    Start-Sleep -Seconds 30
    $zone = Invoke-CloudflareApi 'GET' "/zones/$ZoneId" $Token
    if ($zone.status -eq 'active') {
      Write-Host "域名已接入 Cloudflare：$ZoneName" -ForegroundColor Green
      return $zone
    }
  }

  Write-Host 'Cloudflare 仍未检测到 NS 生效。可以先完成部署，等 NS 生效后再访问域名。' -ForegroundColor Yellow
  return $zone
}

function Remove-ConflictingDnsRecords {
  param(
    [Parameter(Mandatory = $true)][string]$ZoneId,
    [Parameter(Mandatory = $true)][string]$HostName,
    [Parameter(Mandatory = $true)][string]$Token
  )

  $records = @()
  $encodedName = [System.Uri]::EscapeDataString($HostName)
  foreach ($type in @('A', 'AAAA', 'CNAME')) {
    $result = Invoke-CloudflareApi 'GET' "/zones/$ZoneId/dns_records?name=$encodedName&type=$type&per_page=100" $Token
    $records += @($result)
  }

  if (!$records.Count) {
    Write-Host "未发现 $HostName 上会影响 Worker Custom Domain 的普通 DNS 记录。" -ForegroundColor Green
    return
  }

  Write-Host ''
  Write-Host "发现 $HostName 上已有普通 DNS 记录，可能导致 522：" -ForegroundColor Yellow
  foreach ($record in $records) {
    Write-Host ("  {0} {1} -> {2}" -f $record.type, $record.name, $record.content)
  }

  $choice = Read-Choice '请选择处理方式' @(
    '删除这些记录，让 Worker Custom Domain 接管'
    '保留这些记录，稍后我自己处理'
  ) 1

  if ($choice -ne 1) {
    return
  }

  foreach ($record in $records) {
    Invoke-CloudflareApi 'DELETE' "/zones/$ZoneId/dns_records/$($record.id)" $Token | Out-Null
    Write-Host ("已删除：{0} {1}" -f $record.type, $record.name) -ForegroundColor Green
  }
}

function Test-WorkerHealth {
  param([Parameter(Mandatory = $true)][string]$Domain)

  $url = "https://$Domain/health"
  Write-Host ''
  Write-Host "正在验证访问：$url" -ForegroundColor Cyan

  $lastError = ''
  for ($i = 1; $i -le 3; $i++) {
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
      if ($response.StatusCode -eq 200) {
        Write-Host "访问正常：$url" -ForegroundColor Green
        return
      }

      $lastError = "HTTP $($response.StatusCode)"
    } catch {
      $statusCode = $null
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
        $statusCode = [int]$_.Exception.Response.StatusCode
      }

      if ($statusCode -eq 522) {
        Write-Host '当前域名返回 522，说明请求还在走普通 DNS 源站链路，没有进入 Worker。' -ForegroundColor Yellow
        Write-Host '处理方式：Cloudflare 控制台 -> DNS，删除这个主机名已有的 A/AAAA/CNAME 记录；然后到 Worker -> Settings -> Domains & Routes 确认 Custom Domain 已绑定。' -ForegroundColor Yellow
        Write-Host 'Cloudflare 会为 Worker Custom Domain 自动创建需要的 DNS 记录，不要再手动给同一个主机名添加普通源站记录。' -ForegroundColor Yellow
        return
      }

      if ($statusCode -eq 500 -or $statusCode -eq 1101) {
        Write-Host 'Worker 已被访问到，但运行时报错。请到 Cloudflare Workers 日志查看异常详情。' -ForegroundColor Yellow
        return
      }

      $lastError = $_.Exception.Message
    }

    if ($i -lt 3) {
      Write-Host "访问暂未成功（$lastError），10 秒后重试 $($i + 1)/3..." -ForegroundColor Yellow
      Start-Sleep -Seconds 10
    }
  }

  Write-Host "访问验证失败：$lastError" -ForegroundColor Yellow
  Write-Host "你也可以稍后手动打开：$url" -ForegroundColor Yellow
}

function Resolve-CloudflareId {
  param(
    [Parameter(Mandatory = $true)][string]$Kind,
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$CurrentId = ''
  )

  $label = if ($Kind -eq 'd1') { 'D1 数据库' } else { 'KV 命名空间' }
  Assert-CloudflareResourceName $label $Name
  if ([string]::IsNullOrWhiteSpace($CurrentId)) {
    $CurrentId = ''
  }
  Write-Host ''
  Write-Host "$label：默认名称 $Name。" -ForegroundColor Cyan

  $choice = 1
  if ($CurrentId) {
    $choice = Read-Choice "请选择 $label 处理方式" @(
      "使用当前配置中的 ID：$CurrentId"
      "自动创建新的 $label"
      '手动输入已有 ID'
    ) 1
  } else {
    $choice = Read-Choice "请选择 $label 处理方式" @(
      "自动创建新的 $label"
      '手动输入已有 ID'
    ) 1
    if ($choice -eq 2) {
      $choice = 3
    }
  }

  if ($choice -eq 1 -and $CurrentId) {
    return $CurrentId
  }
  if ($choice -eq 3) {
    if ($Kind -eq 'd1') {
      Write-Host '获取方式：Cloudflare 控制台 -> Workers & Pages -> D1 -> 打开数据库 -> 复制 Database ID。' -ForegroundColor Cyan
      return Read-RequiredText '请输入 D1 database_id' $CurrentId
    }
    Write-Host '获取方式：Cloudflare 控制台 -> Workers & Pages -> KV -> 打开命名空间 -> 复制 Namespace ID。' -ForegroundColor Cyan
    return Read-RequiredText '请输入 KV namespace id' $CurrentId
  }

  Push-Location $root
  try {
    if ($Kind -eq 'd1') {
      Write-Host "正在创建 D1 数据库：$Name"
      $out = Invoke-CaptureCmd "$(Get-WranglerCommand) d1 create $Name"
      $m = [regex]::Match($out, 'database_id\s*=\s*"([^"]+)"')
      if ($m.Success) { return $m.Groups[1].Value }
      $m = [regex]::Match($out, '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})')
      if ($m.Success) { return $m.Groups[1].Value }
      Write-Host $out
      throw '未能从 wrangler 输出中识别 D1 database_id。'
    }

    Write-Host "正在创建 KV 命名空间：$Name"
    $out = Invoke-CaptureCmd "$(Get-WranglerCommand) kv namespace create $Name"
    $m = [regex]::Match($out, 'id\s*=\s*"([^"]+)"')
    if ($m.Success) { return $m.Groups[1].Value }
    $m = [regex]::Match($out, '([0-9a-fA-F]{32})')
    if ($m.Success) { return $m.Groups[1].Value }
    Write-Host $out
    throw '未能从 wrangler 输出中识别 KV namespace id。'
  } finally {
    Pop-Location
  }
}

if (!(Test-Path -LiteralPath $wranglerToml)) {
  if (!(Test-Path -LiteralPath $wranglerTomlExample)) {
    throw "找不到配置模板：$wranglerTomlExample"
  }
  Copy-Item -LiteralPath $wranglerTomlExample -Destination $wranglerToml
  Write-Host "已从模板生成本地配置：$wranglerToml" -ForegroundColor Green
}

$script:setupState = Read-SetupState

Write-Host ''
Write-Host '=== F-UI Cloudflare 部署配置 ===' -ForegroundColor Cyan
Write-Host '脚本会把非敏感配置写入 f-worker\wrangler.toml；Secret 会通过 Wrangler 交互输入，不写入配置文件。'
Write-Host ''

Write-Host '登录方式提示：' -ForegroundColor Cyan
Write-Host '1. Wrangler 不会在命令行直接收 Cloudflare 账号密码。'
Write-Host '2. 选择浏览器登录时，脚本会打开 Cloudflare 登录页，你在浏览器输入账号、密码和二次验证。'
Write-Host '3. 服务器环境可选择 API Token 登录，Token 需要 Workers、D1、KV、Workers Scripts 编辑权限。'
Write-Host ''

Push-Location $root
$hasSession = Test-WranglerSession

if ($hasSession) {
  $logoutChoice = Read-Choice '检测到 Wrangler 已登录，请选择处理方式' @(
    '退出当前账号并重新登录'
    '继续使用当前账号'
  ) 1
  if ($logoutChoice -eq 1) {
    Invoke-Step { Invoke-Wrangler logout }
    $hasSession = $false
  }
}

if (!$hasSession) {
  Write-Host ''
  $loginMode = Read-Choice '请选择 Cloudflare 登录方式' @(
    '浏览器登录 Cloudflare 账号'
    '粘贴 Cloudflare API Token'
  ) 1
  if ($loginMode -eq 2) {
    Write-Host 'API Token 获取方式：Cloudflare 控制台 -> My Profile -> API Tokens -> Create Token。' -ForegroundColor Cyan
    Write-Host '请添加下面这些权限：'
    Write-Host '  1. Account -> Workers Scripts -> Edit'
    Write-Host '  2. Zone -> Workers Routes -> Edit'
    Write-Host '  3. Account -> Workers KV Storage -> Edit'
    Write-Host '  4. Account -> D1 -> Edit'
    Write-Host '  5. Zone -> Zone -> Edit'
    Write-Host '  6. Zone -> DNS -> Edit'
    Write-Host '资源范围：Account Resources 选择当前账号；Zone Resources 选择 All zones。' -ForegroundColor Cyan
    $token = Read-SecretText '请粘贴 Cloudflare API Token'
    $env:CLOUDFLARE_API_TOKEN = $token
  } else {
    Write-Host '即将打开 Cloudflare 登录页。请在浏览器中输入 Cloudflare 账号、密码和二次验证。' -ForegroundColor Cyan
    Invoke-Step { Invoke-Wrangler login }
  }

  Assert-WranglerSession
}
Pop-Location

$toml = Get-Content -LiteralPath $wranglerToml -Raw -Encoding UTF8

$currentWorkerName = Get-TopValue $toml 'name'
$currentAccountId = Get-TopValue $toml 'account_id'
$currentDomain = Get-RouteDomain $toml
$currentAdmin = Get-VarValue $toml 'admin'
$currentSiteKey = Get-VarValue $toml 'turnstile_site_key'
$currentD1Name = Get-FirstBlockValue $toml 'd1_databases' 'database_name'
$currentD1Id = Get-FirstBlockValue $toml 'd1_databases' 'database_id'
$currentKvId = Get-FirstBlockValue $toml 'kv_namespaces' 'id'

if (!$currentAccountId) { $currentAccountId = Get-SetupValue 'account_id' }
if (!$currentDomain) { $currentDomain = Get-SetupValue 'domain' }
if (!$currentAdmin) { $currentAdmin = Get-SetupValue 'admin' }
if (!$currentSiteKey) { $currentSiteKey = Get-SetupValue 'turnstile_site_key' }
if (!$currentD1Id) { $currentD1Id = Get-SetupValue 'd1_id' }
if (!$currentKvId) { $currentKvId = Get-SetupValue 'kv_id' }
if (!$currentWorkerName) { $currentWorkerName = Get-SetupValue 'worker_name' }
if (!$currentD1Name) { $currentD1Name = Get-SetupValue 'd1_name' }

$configComplete = (
  ![string]::IsNullOrWhiteSpace($currentWorkerName) -and
  ![string]::IsNullOrWhiteSpace($currentD1Name) -and
  ![string]::IsNullOrWhiteSpace($currentD1Id) -and
  ![string]::IsNullOrWhiteSpace($currentKvId) -and
  ![string]::IsNullOrWhiteSpace($currentDomain) -and
  ![string]::IsNullOrWhiteSpace($currentAdmin)
)

if ($configComplete -and !$Reconfigure) {
  Write-Host ''
  Write-Host '检测到 wrangler.toml 已有完整部署配置，自动跳过配置问答。若要重新配置，请加 -Reconfigure。' -ForegroundColor Green
  $accountId = $currentAccountId
  $workerName = $currentWorkerName
  $d1Name = $currentD1Name
  $d1Id = $currentD1Id
  $kvId = $currentKvId
  $domain = Normalize-DomainName $currentDomain
  $adminEmail = $currentAdmin
  $turnstileSiteKey = $currentSiteKey
  if ($turnstileSiteKey -and !(Test-SetupStep 'turnstile_secret')) {
    $turnstileSecretMode = 1
  } else {
    $turnstileSecretMode = 0
  }
} else {
Write-Host ''
Write-Host 'Account ID 可以从 Cloudflare 控制台右侧栏复制；如果 Wrangler 当前只登录了一个账号，可直接回车留空。' -ForegroundColor Cyan
$accountId = Read-Text '请输入 Cloudflare Account ID，可留空' $currentAccountId
if ([string]::IsNullOrWhiteSpace($accountId)) {
  $detectedAccountId = Get-WranglerAccountId
  if ($detectedAccountId) {
    $accountId = $detectedAccountId
    Write-Host "已自动识别 Account ID：$accountId" -ForegroundColor Green
  }
}

Write-Host ''
Write-Host 'Worker 会在部署时自动创建或更新，名称默认使用 f-ui。' -ForegroundColor Cyan
$workerName = Read-Text '请输入 Worker 名称' ($(if ($currentWorkerName) { $currentWorkerName } else { 'f-ui' }))
if ([string]::IsNullOrWhiteSpace($workerName)) { $workerName = 'f-ui' }

$d1Name = Read-Text '请输入 D1 数据库名称' ($(if ($currentD1Name) { $currentD1Name } else { 'f-ui-db' }))
if ([string]::IsNullOrWhiteSpace($d1Name)) { $d1Name = 'f-ui-db' }
$d1Id = Resolve-CloudflareId 'd1' $d1Name $currentD1Id

$kvName = 'f-ui-kv'
$kvId = Resolve-CloudflareId 'kv' $kvName $currentKvId

Write-Host ''
Write-Host '自定义域名是部署必填项，请填写已经或准备接入 Cloudflare 的域名。' -ForegroundColor Cyan
$domain = Read-RequiredText '请输入绑定到 F-UI 的域名' $currentDomain
$domain = Normalize-DomainName $domain

Write-Host ''
$defaultZoneName = Get-DefaultZoneName $domain
$zoneChoice = Read-Choice '是否让脚本把域名添加到 Cloudflare 管理，并清理冲突 DNS 记录' @(
  '是，自动处理 Cloudflare 域名管理'
  '否，我已经处理好域名'
) 1

if ($zoneChoice -eq 1) {
  if ([string]::IsNullOrWhiteSpace($accountId)) {
    Write-Host '自动管理域名必须有 Cloudflare Account ID。' -ForegroundColor Yellow
    $accountId = Read-RequiredText '请输入 Cloudflare Account ID' ''
  }

  $zoneName = Read-RequiredText '请输入根域名' $defaultZoneName
  $zoneName = Normalize-DomainName $zoneName

  if (!$domain.EndsWith(".$zoneName") -and $domain -ne $zoneName) {
    throw "绑定域名 $domain 不属于根域名 $zoneName，请检查输入。"
  }

  $cfToken = Get-CloudflareApiToken
  $zone = Ensure-CloudflareZone $zoneName $accountId $cfToken
  $zone = Wait-CloudflareZoneActive $zone.id $zoneName $cfToken
  Remove-ConflictingDnsRecords $zone.id $domain $cfToken
}

Write-Host ''
Write-Host '管理员邮箱是部署必填项。首次注册时必须使用这个邮箱。' -ForegroundColor Cyan
$adminEmail = Read-RequiredText '请输入管理员邮箱' $currentAdmin

Write-Host ''
$turnstileSiteKey = $currentSiteKey
$turnstileSecretMode = 0
if ($currentSiteKey) {
  $turnstileChoice = Read-Choice '请选择 Turnstile 人机验证配置' @(
    "使用当前 Site Key：$currentSiteKey"
    '重新输入 Site Key，并设置 Secret Key'
    '禁用 Turnstile 配置'
  ) 1
  if ($turnstileChoice -eq 2) {
    Write-Host 'Site Key 获取方式：Cloudflare 控制台 -> Turnstile -> 添加站点或打开站点详情 -> 复制 Site Key。' -ForegroundColor Cyan
    $turnstileSiteKey = Read-RequiredText '请输入 Turnstile Site Key' $currentSiteKey
    $turnstileSecretMode = 1
  } elseif ($turnstileChoice -eq 3) {
    $turnstileSiteKey = ''
    $turnstileSecretMode = 0
  } else {
    $turnstileSecretMode = Read-Choice '是否更新 Turnstile Secret Key' @(
      '不更新'
      '现在更新'
    ) 1
  }
} else {
  $turnstileChoice = Read-Choice '是否现在配置 Turnstile 人机验证' @(
    '暂不配置'
    '配置 Site Key 和 Secret Key'
  ) 1
  if ($turnstileChoice -eq 2) {
    Write-Host 'Site Key 获取方式：Cloudflare 控制台 -> Turnstile -> 添加站点或打开站点详情 -> 复制 Site Key。' -ForegroundColor Cyan
    $turnstileSiteKey = Read-RequiredText '请输入 Turnstile Site Key' ''
    $turnstileSecretMode = 1
  }
}
}

$toml = Set-TopValue $toml 'name' $workerName
$toml = Set-Or-Remove-TopValue $toml 'account_id' $accountId
$toml = Set-RouteDomain $toml $domain
$toml = Set-BlockValue $toml 'kv_namespaces' 'binding' 'F_UI_KV'
$toml = Set-BlockValue $toml 'kv_namespaces' 'id' $kvId
$toml = Set-BlockValue $toml 'd1_databases' 'binding' 'F_UI_DB'
$toml = Set-BlockValue $toml 'd1_databases' 'database_name' $d1Name
$toml = Set-BlockValue $toml 'd1_databases' 'database_id' $d1Id
$toml = Set-VarValue $toml 'admin' $adminEmail
$toml = Set-VarValue $toml 'domain' $domain
$toml = Set-VarValue $toml 'turnstile_site_key' $turnstileSiteKey
$toml = Set-VarValue $toml 'WORKER_NAME' $workerName

Set-Content -LiteralPath $wranglerToml -Value $toml -Encoding UTF8
Set-SetupValue 'account_id' $accountId
Set-SetupValue 'worker_name' $workerName
Set-SetupValue 'd1_name' $d1Name
Set-SetupValue 'd1_id' $d1Id
Set-SetupValue 'kv_id' $kvId
Set-SetupValue 'domain' $domain
Set-SetupValue 'admin' $adminEmail
Set-SetupValue 'turnstile_site_key' $turnstileSiteKey
Set-SetupStep 'config_written'
Write-Host ''
Write-Host 'wrangler.toml 已更新。' -ForegroundColor Green

Push-Location $workerDir
Write-Host ''
Write-Host '=== 应用 D1 迁移 ===' -ForegroundColor Cyan
if (Test-SetupStep 'd1_migrations') {
  Write-Host 'D1 迁移之前已成功执行过；仍会执行一次幂等检查，Wrangler 会自动跳过已应用的迁移。' -ForegroundColor Green
}
Write-Host "将执行：wrangler d1 migrations apply $d1Name --remote"
Invoke-Step { Invoke-Wrangler d1 migrations apply $d1Name --remote }
Set-SetupStep 'd1_migrations'

if (!$SkipDeploy) {
  Write-Host ''
  Write-Host '=== 部署 Worker ===' -ForegroundColor Cyan
  if ((Test-SetupStep 'deployed') -and !$Reconfigure) {
    Write-Host '检测到 Worker 已在上次执行中部署成功，自动跳过部署。若要重新部署，请加 -Reconfigure 或直接运行 scripts\deploy.cmd。' -ForegroundColor Green
  } else {
    Push-Location $root
    Invoke-Step { cmd /c scripts\deploy.cmd }
    Pop-Location
    Set-SetupStep 'deployed'
  }
} else {
  Write-Host ''
  Write-Host '已按 SkipDeploy 参数跳过部署。' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '=== 设置 jwt_secret ===' -ForegroundColor Cyan
if (Test-SetupStep 'jwt_secret') {
  Write-Host '检测到 jwt_secret 已在上次执行中设置成功，自动跳过。' -ForegroundColor Green
} else {
  $jwtSecretChoice = Read-Choice '请选择 jwt_secret 设置方式' @(
    '自动生成随机密钥'
    '自己输入自定义密钥'
  ) 1
  if ($jwtSecretChoice -eq 1) {
    $jwtSecret = New-RandomSecret
    Write-Host '已自动生成 jwt_secret，长度满足要求。' -ForegroundColor Green
  } else {
    Write-Host '请输入任意 32 位以上随机字符串。输入内容会隐藏，不会写入配置文件。' -ForegroundColor Cyan
    $jwtSecret = Read-MinLengthSecretText '请输入 jwt_secret' 32
  }
  Invoke-Step { Set-WranglerSecret 'jwt_secret' $jwtSecret }
  Set-SetupStep 'jwt_secret'
}

if ($turnstileSiteKey -and $turnstileSecretMode -eq 1) {
  Write-Host ''
  if (Test-SetupStep 'turnstile_secret') {
    Write-Host '检测到 turnstile_secret 已在上次执行中设置成功，自动跳过。' -ForegroundColor Green
  } else {
    Write-Host 'Turnstile Secret Key 获取方式：Cloudflare 控制台 -> Turnstile -> 同一个站点详情 -> 复制 Secret Key。' -ForegroundColor Cyan
    Invoke-Step { Invoke-Wrangler secret put turnstile_secret }
    Set-SetupStep 'turnstile_secret'
  }
} else {
  Write-Host ''
  Write-Host '已跳过 Turnstile Secret。以后可在管理台或通过 npx wrangler secret put turnstile_secret 配置。' -ForegroundColor Yellow
}
Pop-Location

Write-Host ''
Write-Host '可选功能提示：' -ForegroundColor Cyan
Write-Host '- CF 用量 API Token：部署后在 F-UI 管理台 -> 系统设置 -> CF 用量中填写。获取位置：Cloudflare -> My Profile -> API Tokens -> Create Token。'
Write-Host '- Telegram Bot Token：部署后在 F-UI 管理台 -> 系统设置 -> TG 通知中填写。获取方式：Telegram 中找 @BotFather 创建机器人。'
Write-Host '- Telegram Chat ID：把机器人加入目标会话后，通过 getUpdates 或相关机器人查询 Chat ID。'

Write-Host ''
if ($SkipDeploy) {
  Write-Host "配置完成。你跳过了部署，稍后可运行 scripts\deploy.cmd 部署 Worker。" -ForegroundColor Green
} else {
  Write-Host "部署完成后请访问：https://$domain/health" -ForegroundColor Green
  Test-WorkerHealth $domain
}
