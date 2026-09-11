#Requires -Version 7.0
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$privateRoot=[IO.Path]::GetFullPath((Join-Path $workspace 'private/recovery'))
if(-not $privateRoot.StartsWith($workspace.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Runtime path outside workspace'}
$source='https://get.enterprisedb.com/postgresql/postgresql-17.11-3-windows-x64-binaries.zip'
$expectedBytes=341325378L
# Recorded from the official EDB HTTPS download on 2026-09-10. Not a publisher-supplied checksum.
$expectedSha='4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf'
New-Item -ItemType Directory -Path $privateRoot -Force | Out-Null
$archivePath=Join-Path $privateRoot 'postgresql-17.11-3-windows-x64-binaries.zip'
if(-not(Test-Path -LiteralPath $archivePath)){
    $ProgressPreference='SilentlyContinue'
    Invoke-WebRequest -Uri $source -OutFile $archivePath -MaximumRedirection 0
}
if((Get-Item -LiteralPath $archivePath).Length -ne $expectedBytes -or (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedSha){throw 'Archive differs from the reviewed artifact; do not execute it'}
$runtimeRoot=Join-Path $privateRoot 'runtime-17.11-3'
$runtimePrefix=$runtimeRoot.TrimEnd('\')+'\'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($archivePath)
$extractedFiles=0;$extractedBytes=0L
try {
    foreach($entry in $zip.Entries){
        if($entry.FullName -notmatch '^pgsql/(bin|lib|share)/' -or $entry.FullName.EndsWith('/')){continue}
        $target=[IO.Path]::GetFullPath((Join-Path $runtimeRoot $entry.FullName.Replace('/','\')))
        if(-not $target.StartsWith($runtimePrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Archive traversal outside runtime'}
        if(Test-Path -LiteralPath $target){
            $stream=$entry.Open();try{$entryHash=[Security.Cryptography.SHA256]::HashData($stream)}finally{$stream.Dispose()}
            if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne [Convert]::ToHexString($entryHash)){throw "Existing runtime file differs from reviewed archive: $($entry.FullName)"}
        }else{
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$false)
        }
        $extractedFiles++;$extractedBytes+=$entry.Length
    }
} finally {$zip.Dispose()}
$postgres=Join-Path $runtimeRoot 'pgsql/bin/postgres.exe'
$version=(& $postgres --version).Trim()
if($LASTEXITCODE -ne 0 -or $version -ne 'postgres (PostgreSQL) 17.11'){throw 'Unexpected PostgreSQL runtime'}
$provenance=[ordered]@{source=$source;archiveBytes=$expectedBytes;archiveSha256=$expectedSha;publisherChecksumVerified=$false;version=$version;signature=(Get-AuthenticodeSignature -LiteralPath $postgres).Status.ToString();extractedFiles=$extractedFiles;extractedBytes=$extractedBytes;runtime=$runtimeRoot;globalServiceInstalled=$false}
[IO.File]::WriteAllText((Join-Path $privateRoot 'runtime-provenance.json'),($provenance|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$provenance | ConvertTo-Json
