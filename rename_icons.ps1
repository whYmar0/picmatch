$srcDir = 'c:\Users\zell\Documents\PythonProjects\project\picmatch_v5\frontend\src'
$files = Get-ChildItem -Path $srcDir -Recurse -Include '*.jsx','*.js' | Where-Object { $_.FullName -notlike '*node_modules*' }

# Replacements: ordered from longest to avoid partial substitutions
# Image -> ImageSquare MUST come before anything else with "Image" prefix
# Copy  -> LinkSimple (note: LinkSimple already exists in some files — handled by removing duplicate import)

$pairs = @(
    ("PaperPlaneTilt", "PaperPlaneRight"),
    ("ShareNetwork",   "Export"),
    ("ChartBar",       "TrendUp"),
    ("Chats",          "ChatCircle"),
    ("UploadSimple",   "__PLACEHOLDER_UPLOADSIMPLE__"), # protect already-correct names
    ("Upload",         "UploadSimple"),
    ("__PLACEHOLDER_UPLOADSIMPLE__", "UploadSimple"),
    ("TrashSimple",    "__PLACEHOLDER_TRASHSIMPLE__"),
    ("Trash",          "TrashSimple"),
    ("__PLACEHOLDER_TRASHSIMPLE__", "TrashSimple"),
    ("LockSimple",     "__PLACEHOLDER_LOCKSIMPLE__"),
    ("Lock",           "LockSimple"),
    ("__PLACEHOLDER_LOCKSIMPLE__", "LockSimple"),
    ("ImageSquare",    "__PLACEHOLDER_IMAGESQUARE__"),
    ("ImageBroken",    "__PLACEHOLDER_IMAGEBROKEN__"),
    ("ImageLightbox",  "__PLACEHOLDER_IMAGELIGHTBOX__"),
    ("Image",          "ImageSquare"),
    ("__PLACEHOLDER_IMAGESQUARE__",  "ImageSquare"),
    ("__PLACEHOLDER_IMAGEBROKEN__",  "ImageBroken"),
    ("__PLACEHOLDER_IMAGELIGHTBOX__","ImageLightbox"),
    ("Copy",           "LinkSimple")
)

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $original = $content

    foreach ($pair in $pairs) {
        $old = $pair[0]
        $new = $pair[1]

        # Replace word-boundary occurrences only
        $pattern = '(?<![A-Za-z0-9])' + [regex]::Escape($old) + '(?![A-Za-z0-9])'
        $content = [regex]::Replace($content, $pattern, $new)
    }

    # Fix duplicate LinkSimple in import (e.g. "LinkSimple, LinkSimple" -> "LinkSimple")
    $content = [regex]::Replace($content, 'LinkSimple,\s*LinkSimple', 'LinkSimple')
    $content = [regex]::Replace($content, 'LinkSimple\s*,\s*LinkSimple', 'LinkSimple')

    if ($content -ne $original) {
        Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
        Write-Host "MODIFIED: $($file.Name)"
    }
}

Write-Host "Done."
