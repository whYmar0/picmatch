# Verify: check for remaining old names and show sample imports
$src = 'c:\Users\zell\Documents\PythonProjects\project\picmatch_v5\frontend\src'

Write-Host '=== Checking for remaining old icon names ==='
Get-ChildItem $src -Recurse -Include '*.jsx','*.js' | ForEach-Object {
    $c = Get-Content $_.FullName -Raw
    $found = @()
    if ($c -match 'ChartBar') { $found += 'ChartBar' }
    if ($c -match 'PaperPlaneTilt') { $found += 'PaperPlaneTilt' }
    if ($c -match 'ShareNetwork') { $found += 'ShareNetwork' }
    if ($found.Count -gt 0) {
        Write-Host ("  STILL HAS: " + $_.Name + " => " + ($found -join ', '))
    }
}

Write-Host ''
Write-Host '=== Navbar.jsx first 14 lines ==='
Get-Content ($src + '\components\Navbar.jsx') | Select-Object -First 14

Write-Host ''
Write-Host '=== AlbumCard.jsx first 14 lines ==='
Get-Content ($src + '\components\AlbumCard.jsx') | Select-Object -First 14

Write-Host ''
Write-Host '=== main.jsx ==='
Get-Content ($src + '\main.jsx')
