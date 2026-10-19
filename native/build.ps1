param(
 [Parameter(Mandatory=$true)][string]$Cargo,
 [Parameter(Mandatory=$true)][string]$WasmBindgen,
 [Parameter(Mandatory=$true)][string]$CargoHome,
 [Parameter(Mandatory=$true)][string]$RustupHome
)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$revision='9931329b9fae0b05373b4dc3ac7c58541f0891a4'
$archive=Join-Path $PSScriptRoot 'pdfcraft-source.tar.gz'
$source=Join-Path $PSScriptRoot 'upstream'
if (-not (Test-Path -LiteralPath $archive)) {
 Invoke-WebRequest "https://codeload.github.com/storytold/pdfcraft/tar.gz/$revision" -OutFile $archive
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne '953F32944503E09323C4D66AAC2528974CB04F94ACFC1A4DFE50C1A86F0091ED') { throw 'Pinned PdfCraft archive hash differs' }
# Never overwrite an existing source directory: builds verify the complete source
# against a fresh pinned extraction instead of trusting an untracked checkout.
$staging=Join-Path $PSScriptRoot ('verified-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
& tar -xf $archive -C $staging
if ($LASTEXITCODE -ne 0) { throw 'Source extraction failed' }
$extracted=Join-Path $staging "pdfcraft-$revision"
if (Test-Path -LiteralPath $source) {
 $expected=Get-ChildItem -LiteralPath $extracted -Recurse -File
 foreach ($file in $expected) {
  $relative=$file.FullName.Substring($extracted.Length+1)
  $existing=Join-Path $source $relative
  if (-not (Test-Path -LiteralPath $existing) -or (Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath $existing).Hash) { throw "Upstream source differs: $relative" }
 }
} else { Move-Item -LiteralPath $extracted -Destination $source }
# Process-scoped environment only; no global Rust setup or added font packages.
$env:CARGO_HOME=$CargoHome
$env:RUSTUP_HOME=$RustupHome
Remove-Item Env:CRAFT_FONTS_DIR -ErrorAction SilentlyContinue
Remove-Item Env:CRAFT_FONTS_REQUIRED -ErrorAction SilentlyContinue
if ((& $Cargo --version) -notmatch '^cargo 1\.95\.0 ') { throw 'Use isolated Rust/Cargo 1.95.0' }
if ((& $WasmBindgen --version) -ne 'wasm-bindgen 0.2.129') { throw 'Use wasm-bindgen 0.2.129' }
& $Cargo build --manifest-path (Join-Path $PSScriptRoot 'pdfcraft/Cargo.toml') --release --target wasm32-unknown-unknown --locked
if ($LASTEXITCODE -ne 0) { throw 'WASM compilation failed' }
& $WasmBindgen (Join-Path $PSScriptRoot 'pdfcraft/target/wasm32-unknown-unknown/release/ar_native_text.wasm') --target web --out-dir (Join-Path $root 'src/pdf/native/wasm')
if ($LASTEXITCODE -ne 0) { throw 'WASM bindings failed' }
# Leave downloaded/staged source ignored, for reproducibility/auditing; no broad deletion.
Get-FileHash (Join-Path $root 'src/pdf/native/wasm/ar_native_text_bg.wasm')
