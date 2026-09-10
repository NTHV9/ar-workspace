#Requires -Version 7.0
[CmdletBinding()]
param(
    [ValidateSet('SchemaReplay','SyntheticRestore')][string]$Mode='SchemaReplay',
    [ValidateRange(49152,65535)][int]$Port=55432,
    [string[]]$AdditionalMigrationNames=@(),
    [switch]$ApprovedSyntheticDump
)
$ErrorActionPreference='Stop'
if($Mode -eq 'SyntheticRestore' -and -not $ApprovedSyntheticDump){throw 'Synthetic dump/restore requires review of this scoped script and explicit -ApprovedSyntheticDump. No live export exists here.'}
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$privateRoot=[IO.Path]::GetFullPath((Join-Path $workspace 'private/recovery'))
$workspacePrefix=$workspace.TrimEnd('\')+'\'
if(-not $privateRoot.StartsWith($workspacePrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Private recovery path is outside workspace'}
$bin=Join-Path $privateRoot 'runtime-17.11-3/pgsql/bin'
foreach($tool in @('postgres','initdb','pg_ctl','psql','createdb','pg_dump','pg_restore')){if(-not(Test-Path -LiteralPath (Join-Path $bin ($tool+'.exe')))){throw "Portable PostgreSQL tool missing: $tool"}}
if(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue){throw "Loopback port $Port is already in use; no server was touched"}
$runId=[Guid]::NewGuid().ToString('N')
$runDirectory=Join-Path $privateRoot ('run-'+$runId)
if(Test-Path -LiteralPath $runDirectory){throw 'Run directory already exists'}
New-Item -ItemType Directory -Path $runDirectory | Out-Null
$cluster=Join-Path $runDirectory 'cluster'
$passwordFile=Join-Path $runDirectory 'init-password.private'
$passFile=Join-Path $runDirectory 'pgpass.private'
$encoding=[Text.UTF8Encoding]::new($false)
$localPassword=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
[IO.File]::WriteAllText($passwordFile,$localPassword+"`n",$encoding)
[IO.File]::WriteAllText($passFile,"127.0.0.1:$($Port):*:recovery_admin:$($localPassword)`n",$encoding)
$localPassword=$null
$marker=[ordered]@{purpose='katathani-ar-synthetic-local-recovery';runId=$runId;host='127.0.0.1';port=$Port;cluster=$cluster;noProviderCredentials=$true;createdAt=[DateTime]::UtcNow.ToString('o')}
[IO.File]::WriteAllText((Join-Path $runDirectory 'recovery-marker.json'),($marker|ConvertTo-Json),$encoding)
$script:toolCounter=0
function Invoke-LocalTool {
    param([string]$Tool,[string[]]$ToolArgs,[switch]$AllowFailure)
    $script:toolCounter++
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=Join-Path $bin ($Tool+'.exe')
    $start.UseShellExecute=$false
    $start.CreateNoWindow=$true
    # pg_ctl's server child may retain inherited pipe handles after pg_ctl exits.
    # Its server log is already a private file; do not wait for pipe EOF on that tool.
    $capture=$Tool -ne 'pg_ctl'
    $start.RedirectStandardOutput=$capture
    $start.RedirectStandardError=$capture
    foreach($value in $ToolArgs){$start.ArgumentList.Add($value)}
    # Pass OS/runtime paths only: no inherited database/provider credentials at all.
    $start.Environment.Clear()
    foreach($key in @('SystemRoot','SystemDrive','WINDIR','TEMP','TMP','Path')){
        $value=[Environment]::GetEnvironmentVariable($key)
        if($value){$start.Environment[$key]=$value}
    }
    $start.Environment['PGPASSFILE']=$passFile
    $start.Environment['PGCONNECT_TIMEOUT']='10'
    $start.Environment['PGAPPNAME']='ar-local-synthetic-recovery'
    $process=[Diagnostics.Process]::new();$process.StartInfo=$start
    [void]$process.Start()
    if($capture){$stdoutTask=$process.StandardOutput.ReadToEndAsync();$stderrTask=$process.StandardError.ReadToEndAsync()}
    if(-not $process.WaitForExit(120000)){
        # Only this explicitly spawned process tree is terminated, never by process name.
        try{$process.Kill($true);$process.WaitForExit(10000)|Out-Null}catch{}
        throw "Local $Tool exceeded timeout; inspect the private run directory"
    }
    $stdout='';$stderr='';if($capture){$stdout=$stdoutTask.GetAwaiter().GetResult();$stderr=$stderrTask.GetAwaiter().GetResult()};$code=$process.ExitCode
    $logPath=Join-Path $runDirectory ('tool-'+$script:toolCounter.ToString('000')+'-'+$Tool+'.log')
    [IO.File]::WriteAllText($logPath,$stdout+"`n"+$stderr,$encoding)
    if($code -ne 0 -and -not $AllowFailure){throw "Local $Tool failed with exit $code. Private log: $logPath"}
    return [pscustomobject]@{Code=$code;Output=$stdout;Log=$logPath}
}
function Invoke-LocalSql {
    param([string]$Database,[string]$File,[string]$Command)
    if($Database -notmatch '^ar_recovery_(source|restored)_[a-f0-9]{32}$'){throw 'Database name outside synthetic recovery scope'}
    $toolArgs=@('-X','--no-password','-h','127.0.0.1','-p',[string]$Port,'-U','recovery_admin','-d',$Database,'-v','ON_ERROR_STOP=1','-q','-t','-A')
    if($File){$toolArgs+=@('-f',$File)}elseif($Command){$toolArgs+=@('-c',$Command)}else{throw 'Missing local SQL input'}
    return Invoke-LocalTool -Tool 'psql' -ToolArgs $toolArgs
}
$sourceDb='ar_recovery_source_'+$runId
$restoredDb='ar_recovery_restored_'+$runId
$started=$false;$serverStopped=$false;$passed=$false;$applied=@();$fixtureResults=@();$fingerprint=$null;$dumpInfo=$null
try {
    $version=(Invoke-LocalTool -Tool 'postgres' -ToolArgs @('--version')).Output.Trim()
    if($version -notmatch '^postgres \(PostgreSQL\) 17\.'){throw 'Unexpected PostgreSQL major version'}
    Invoke-LocalTool -Tool 'initdb' -ToolArgs @('-D',$cluster,'-U','recovery_admin','--encoding=UTF8','--locale=C','--auth-host=scram-sha-256','--auth-local=scram-sha-256',('--pwfile='+$passwordFile)) | Out-Null
    $serverOptions="-h 127.0.0.1 -p $Port -c max_connections=12 -c shared_buffers=32MB -c log_statement=none -c log_min_error_statement=panic"
    Invoke-LocalTool -Tool 'pg_ctl' -ToolArgs @('-D',$cluster,'-l',(Join-Path $runDirectory 'postgres.log'),'-w','-t','60','-o',$serverOptions,'start') | Out-Null
    $started=$true
    Invoke-LocalTool -Tool 'createdb' -ToolArgs @('--no-password','-h','127.0.0.1','-p',[string]$Port,'-U','recovery_admin',$sourceDb) | Out-Null
    $identity=(Invoke-LocalSql -Database $sourceDb -Command "select current_database()||'|'||host(inet_server_addr())||'|'||inet_server_port();").Output.Trim()
    if($identity -ne "$sourceDb|127.0.0.1|$Port"){throw 'Local source identity verification failed'}
    Invoke-LocalSql -Database $sourceDb -File (Join-Path $PSScriptRoot 'supabase-stubs.sql') | Out-Null
    $manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'baseline-migrations.json') -Raw | ConvertFrom-Json
    $migrationDirectory=Join-Path $workspace 'supabase/migrations'
    $toApply=@($manifest.migrations|Sort-Object version)
    foreach($name in $AdditionalMigrationNames){
        if($name -notmatch '^ar_[a-z0-9_]+$' -or $toApply.name -contains $name){throw 'Invalid or duplicate additional migration name'}
        $migrationFiles=@(Get-ChildItem -LiteralPath $migrationDirectory -Filter ("*_"+$name+'.sql'))
        if($migrationFiles.Count -ne 1){throw "Additional migration not uniquely identified: $name"}
        $versionMatch=[regex]::Match($migrationFiles[0].Name,'^(\d{14})_')
        if(-not $versionMatch.Success){throw 'Invalid additional migration filename'}
        $toApply+=[pscustomobject]@{name=$name;version=$versionMatch.Groups[1].Value}
    }
    foreach($migration in $toApply){
        if($migration.name -notmatch '^ar_[a-z0-9_]+$' -or $migration.version -notmatch '^\d{14}$'){throw 'Unsafe migration manifest entry'}
        $migrationFiles=@(Get-ChildItem -LiteralPath $migrationDirectory -Filter ('*_'+$migration.name+'.sql'))
        if($migrationFiles.Count -ne 1){throw "Migration not uniquely identified: $($migration.name)"}
        $file=$migrationFiles[0]
        Invoke-LocalSql -Database $sourceDb -File $file.FullName | Out-Null
        Invoke-LocalSql -Database $sourceDb -Command "insert into supabase_migrations.schema_migrations(version,name) values('$($migration.version)','$($migration.name)');" | Out-Null
        $applied+=[pscustomobject]@{name=$migration.name;version=$migration.version;sourceFile=$file.Name;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    }
    Invoke-LocalSql -Database $sourceDb -File (Join-Path $PSScriptRoot 'local-fixture-prerequisites.sql') | Out-Null
    # Every fixture is synthetic and rolls back. No environment/provider file is loaded.
    $fixtures=@('remittance-rollback.sql','email-threads-rollback.sql','drive-archive-rollback.sql')
    if($AdditionalMigrationNames -contains 'ar_statement_source_policy'){$fixtures+='statement-source-policy-rollback.sql'}
    if($AdditionalMigrationNames -contains 'ar_account_workspace_read'){$fixtures+='account-workspace-rollback.sql'}
    if($AdditionalMigrationNames -contains 'ar_invoice_exceptions'){$fixtures+='invoice-exceptions-rollback.sql'}
    if($AdditionalMigrationNames -contains 'ar_collection_policy'){$fixtures+='policy-rollback.sql'}
    if($AdditionalMigrationNames -contains 'ar_financial_history_ingestion'){$fixtures+='financial-history-rollback.sql'}
    if($AdditionalMigrationNames -contains 'ar_external_billing'){$fixtures+='external-billing-rollback.sql'}
    if($AdditionalMigrationNames -contains 'ar_source_observation_reports'){$fixtures+='source-observation-rollback.sql'}
    if($AdditionalMigrationNames -contains 'ar_financial_granular_steps'){$fixtures+='financial-granular-rollback.sql'}
    if($AdditionalMigrationNames -contains 'ar_operations_recovery'){$fixtures+='operations-recovery-rollback.sql'}
    foreach($fixture in $fixtures){
        Invoke-LocalSql -Database $sourceDb -File (Join-Path $workspace ('tests/sql/'+$fixture)) | Out-Null
        $fixtureResults+=$fixture
    }
    if($AdditionalMigrationNames -contains 'ar_operation_budgets'){
        Invoke-LocalSql -Database $sourceDb -File (Join-Path $PSScriptRoot 'operations-budget-rollback.sql') | Out-Null
        $fixtureResults+='operations-budget-rollback.sql'
    }
    if($AdditionalMigrationNames -contains 'ar_storage_budget_integration'){
        Invoke-LocalSql -Database $sourceDb -File (Join-Path $PSScriptRoot 'storage-budget-rollback.sql') | Out-Null
        $fixtureResults+='storage-budget-rollback.sql'
    }
    if($AdditionalMigrationNames -contains 'ar_file_retention'){
        Invoke-LocalSql -Database $sourceDb -File (Join-Path $PSScriptRoot 'retention-rollback.sql') | Out-Null
        $fixtureResults+='retention-rollback.sql'
    }
    Invoke-LocalSql -Database $sourceDb -File (Join-Path $PSScriptRoot 'synthetic-seed.sql') | Out-Null
    $fingerprint=(Invoke-LocalSql -Database $sourceDb -File (Join-Path $PSScriptRoot 'verify-restored.sql')).Output.Trim()
    [IO.File]::WriteAllText((Join-Path $runDirectory 'source-fingerprint.json'),$fingerprint,$encoding)
    if($Mode -eq 'SyntheticRestore'){
        # Review-gated, loopback-only dump of this script's freshly-created synthetic DB.
        $dumpPath=Join-Path $runDirectory 'synthetic-application.dump'
        Invoke-LocalTool -Tool 'pg_dump' -ToolArgs @('--no-password','-h','127.0.0.1','-p',[string]$Port,'-U','recovery_admin','-d',$sourceDb,'--format=custom','--no-owner','-f',$dumpPath) | Out-Null
        Invoke-LocalTool -Tool 'createdb' -ToolArgs @('--no-password','-h','127.0.0.1','-p',[string]$Port,'-U','recovery_admin',$restoredDb) | Out-Null
        $targetIdentity=(Invoke-LocalSql -Database $restoredDb -Command "select current_database()||'|'||host(inet_server_addr())||'|'||inet_server_port();").Output.Trim()
        if($targetIdentity -ne "$restoredDb|127.0.0.1|$Port"){throw 'Local restore target identity verification failed'}
        Invoke-LocalTool -Tool 'pg_restore' -ToolArgs @('--no-password','-h','127.0.0.1','-p',[string]$Port,'-U','recovery_admin','-d',$restoredDb,'--no-owner','--exit-on-error',$dumpPath) | Out-Null
        $restoredFingerprint=(Invoke-LocalSql -Database $restoredDb -File (Join-Path $PSScriptRoot 'verify-restored.sql')).Output.Trim()
        if($restoredFingerprint -ne $fingerprint){throw 'Restored synthetic counts or hashes differ'}
        [IO.File]::WriteAllText((Join-Path $runDirectory 'restored-fingerprint.json'),$restoredFingerprint,$encoding)
        $dumpInfo=[pscustomobject]@{bytes=(Get-Item -LiteralPath $dumpPath).Length;sha256=(Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash.ToLowerInvariant()}
    }
    $passed=$true
} finally {
    $resolvedCluster=[IO.Path]::GetFullPath($cluster)
    $savedMarker=Get-Content -LiteralPath (Join-Path $runDirectory 'recovery-marker.json') -Raw | ConvertFrom-Json
    if($savedMarker.purpose -ne 'katathani-ar-synthetic-local-recovery' -or $savedMarker.runId -ne $runId -or $savedMarker.cluster -ne $resolvedCluster -or -not $resolvedCluster.StartsWith($runDirectory.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Refusing to stop a cluster outside this marked run'}
    # A timed-out startup may already have spawned postgres before $started was set.
    if(Test-Path -LiteralPath (Join-Path $resolvedCluster 'postmaster.pid')){Invoke-LocalTool -Tool 'pg_ctl' -ToolArgs @('-D',$resolvedCluster,'-w','-t','60','-m','fast','stop') -AllowFailure | Out-Null}
    $listening=Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if(Test-Path -LiteralPath (Join-Path $resolvedCluster 'PG_VERSION')){
        $status=Invoke-LocalTool -Tool 'pg_ctl' -ToolArgs @('-D',$resolvedCluster,'status') -AllowFailure
        $serverStopped=$status.Code -eq 3 -and -not $listening
    }else{$serverStopped=-not $listening -and -not(Test-Path -LiteralPath (Join-Path $resolvedCluster 'postmaster.pid'))}
    $result=[ordered]@{mode=$Mode;passed=($passed -and $serverStopped);syntheticOnly=$true;runDirectory=$runDirectory;startCompleted=$started;serverStopped=$serverStopped;appliedMigrations=$applied;fixtures=$fixtureResults;dump=$dumpInfo;providerRequests=0;liveDataExported=$false;physicalBackupRestore=$false;completedAt=[DateTime]::UtcNow.ToString('o')}
    [IO.File]::WriteAllText((Join-Path $runDirectory 'result.json'),($result|ConvertTo-Json -Depth 8),$encoding)
    if(-not $serverStopped){throw 'Marked local cluster is not verified stopped; inspect private result.json. No unrelated process was touched.'}
}
$result | ConvertTo-Json -Depth 8
