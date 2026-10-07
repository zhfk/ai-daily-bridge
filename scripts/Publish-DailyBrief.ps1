[CmdletBinding(DefaultParameterSetName = 'Daily')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Daily')]
    [ValidatePattern('^\d{4}-\d{2}-\d{2}$')]
    [string]$Date,
    [Parameter(Mandatory = $true, ParameterSetName = 'Sync')]
    [switch]$SyncOnly,
    [Parameter(Mandatory = $true, ParameterSetName = 'Setup')]
    [switch]$Setup
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
if ($repoRoot -ne 'D:\WebstormProject\ai-daily-bridge') {
    throw 'This publisher is restricted to D:\WebstormProject\ai-daily-bridge.'
}

function Invoke-RepositoryGit {
    param([string[]]$GitArguments)
    # Windows PowerShell treats informational native stderr as ErrorRecord objects.
    $ErrorActionPreference = 'Continue'
    $gitOutput = & git -C $repoRoot -c "safe.directory=$repoRoot" @GitArguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Git failed ($($GitArguments[0])): $($gitOutput -join [Environment]::NewLine)"
    }
    return $gitOutput
}

$branch = (Invoke-RepositoryGit @('branch', '--show-current') | Out-String).Trim()
if ($branch -ne 'main') { throw 'The current branch must be main.' }
$remote = (Invoke-RepositoryGit @('remote', 'get-url', '--push', 'origin') | Out-String).Trim()
if ($remote -notin @('git@github.com:zhfk/ai-daily-bridge.git', 'https://github.com/zhfk/ai-daily-bridge.git')) {
    throw 'origin must point to the authorized zhfk/ai-daily-bridge repository.'
}

Invoke-RepositoryGit @('fetch', 'origin') | Write-Output
& git -C $repoRoot -c "safe.directory=$repoRoot" show-ref --verify --quiet refs/remotes/origin/main
$remoteExists = $LASTEXITCODE -eq 0
if ($remoteExists) {
    Invoke-RepositoryGit @('merge', '--ff-only', 'origin/main') | Write-Output
} elseif (-not $Setup) {
    throw 'Remote main is missing. Run the initial setup first.'
}
if ($SyncOnly) {
    Write-Output 'main synchronized with origin/main.'
    exit 0
}

if ($Setup) {
    $publishPaths = @('README.md', 'scripts/Publish-DailyBrief.ps1')
    $commitMessage = 'docs: configure daily AI brief workflow'
} else {
    [void][DateTime]::ParseExact($Date, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    $publishPaths = @("$Date/brief.md", "$Date/wordpress.json")
    $imageManifest = Join-Path $repoRoot "$Date/images.json"
    if (Test-Path -LiteralPath $imageManifest) {
        [void](Get-Content -LiteralPath $imageManifest -Raw -Encoding UTF8 | ConvertFrom-Json)
        $publishPaths += "$Date/images.json"
    }
    foreach ($relativePath in $publishPaths) {
        if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $relativePath) -PathType Leaf)) {
            throw "Missing required file: $relativePath"
        }
    }
    $markdown = Get-Content -LiteralPath (Join-Path $repoRoot "$Date/brief.md") -Raw -Encoding UTF8
    $metadata = Get-Content -LiteralPath (Join-Path $repoRoot "$Date/wordpress.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($metadata.slug -cne "ai-daily-$Date") { throw 'The slug does not match the folder date.' }
    foreach ($field in @('title', 'excerpt', 'content')) {
        if ([string]::IsNullOrWhiteSpace([string]$metadata.$field)) { throw "Missing WordPress field: $field" }
    }
    if ([Globalization.StringInfo]::ParseCombiningCharacters([string]$metadata.title).Count -gt 40) {
        throw 'The article title exceeds 40 characters.'
    }
    if ($metadata.tags -isnot [array] -or $metadata.tags.Count -eq 0) { throw 'tags must be a nonempty array.' }
    if (@($metadata.tags | Where-Object { [string]::IsNullOrWhiteSpace([string]$_) }).Count -gt 0) {
        throw 'tags contains an empty value.'
    }
    if (@($metadata.tags | Select-Object -Unique).Count -ne $metadata.tags.Count) { throw 'tags must be unique.' }
    if ([regex]::IsMatch($markdown, '(?m)^#\s') -or [regex]::IsMatch($metadata.content, '(?i)<h1\b')) {
        throw 'The final body must not contain H1.'
    }
    if ([regex]::Matches($markdown, '(?m)^##\s+\S').Count -ne 5 -or [regex]::Matches($metadata.content, '(?i)<h2\b').Count -ne 5) {
        throw 'Both Markdown and HTML must contain exactly five news H2 headings.'
    }
    $newsSections = [regex]::Split($markdown, '(?m)^##\s+[^\r\n]+')[1..5]
    foreach ($section in $newsSections) {
        if (-not [regex]::IsMatch($section, '\b(CONFIRMED|COMPANY_CLAIM|MEDIA_REPORT|UNCONFIRMED|ANALYSIS)\b')) {
            throw 'Each news item must include a fact-status label.'
        }
        if (-not [regex]::IsMatch($section, '\]\(https?://[^\s)]+\)')) {
            throw 'Each news item must include a direct source link.'
        }
    }
    $decodedHtml = [Net.WebUtility]::HtmlDecode([string]$metadata.content)
    foreach ($link in [regex]::Matches($markdown, '\]\((https?://[^\s)]+)\)')) {
        if (-not $decodedHtml.Contains($link.Groups[1].Value)) { throw 'An article link is missing from the HTML body.' }
    }
    $commitMessage = "docs: add AI daily brief for $Date"
}

if ($remoteExists) {
    $pendingPaths = @(Invoke-RepositoryGit @('log', '--format=', '--name-only', 'origin/main..HEAD') |
        Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Unique)
    foreach ($pendingPath in $pendingPaths) {
        if ($pendingPath -notin $publishPaths) {
            throw "An unpushed commit contains an unrelated file: $pendingPath"
        }
    }
}

Invoke-RepositoryGit (@('add', '--') + $publishPaths) | Write-Output
& git -C $repoRoot -c "safe.directory=$repoRoot" diff --cached --quiet -- @publishPaths
$diffExit = $LASTEXITCODE
if ($diffExit -eq 1) {
    Invoke-RepositoryGit (@('commit', '--only', '-m', $commitMessage, '--') + $publishPaths) | Write-Output
} elseif ($diffExit -ne 0) {
    throw 'Could not inspect the selected staged files.'
} else {
    Write-Output 'No new changes in the selected files; checking publication.'
}
Invoke-RepositoryGit @('push', 'origin', 'main') | Write-Output
$localSha = (Invoke-RepositoryGit @('rev-parse', 'HEAD') | Out-String).Trim()
$remoteHead = (Invoke-RepositoryGit @('ls-remote', 'origin', 'refs/heads/main') | Out-String).Trim()
if (($remoteHead -split '\s+')[0] -ne $localSha) { throw 'Remote main does not match the published commit.' }
Write-Output "Published: https://github.com/zhfk/ai-daily-bridge/commit/$localSha"
