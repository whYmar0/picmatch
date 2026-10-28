$src = 'c:\Users\zell\Documents\PythonProjects\project\picmatch_v5\frontend\src'
Write-Host '=== Remaining FilledHeart / BrokenHeart references ==='
Get-ChildItem $src -Recurse -Include '*.jsx','*.js' | ForEach-Object {
    $c = Get-Content $_.FullName -Raw
    $hits = @()
    if ($c -match 'FilledHeart') { $hits += 'FilledHeart' }
    if ($c -match 'BrokenHeart') { $hits += 'BrokenHeart' }
    if ($hits.Count -gt 0) { Write-Host ($_.Name + ': ' + ($hits -join ', ')) }
}
Write-Host ''
Write-Host '=== AlbumGallery.jsx imports (lines 20-40) ==='
Get-Content ($src + '\components\AlbumGallery.jsx') | Select-Object -Skip 19 -First 20
