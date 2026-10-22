# Writes the FAQPage structured data (for Google) into blogger/theme.xml, built from assets/faq.json.
# The visible FAQ loads from GitHub; this keeps the schema inside the Blogger page so crawlers see it without scripts.
# Run after editing assets/faq.json, then upload theme.xml in Blogger (Theme, Restore):
#   powershell -ExecutionPolicy Bypass -File scripts\make-faq-schema.ps1
# Designed & Developed by Nivesh Sahayak (https://www.niveshsahayak.in/). All rights reserved: see LICENSE.
$root = Split-Path $PSScriptRoot -Parent
$utf8 = New-Object Text.UTF8Encoding($false)
$faq = [IO.File]::ReadAllText("$root\assets\faq.json", $utf8) | ConvertFrom-Json

function Clean([string]$html) {
  $h = [regex]::Replace($html, '</?code>', '')                                # only tags Google accepts in answers stay
  $emoji = '[' + [char]0xD800 + '-' + [char]0xDBFF + ']['  + [char]0xDC00 + '-' + [char]0xDFFF + ']|[' + [char]0x2600 + '-' + [char]0x27BF + [char]0xFE0F + [char]0x200D + ']'
  $h = [regex]::Replace($h, $emoji, '')   # drop emoji
  return ($h -replace '\s{2,}', ' ').Trim()
}

$entities = foreach ($it in $faq.items) {
  $answer = '<p>' + (Clean $it.tldr) + '</p>'
  if ($it.steps) { $answer += '<ol>' + (($it.steps | ForEach-Object { '<li>' + (Clean $_) + '</li>' }) -join '') + '</ol>' }
  if ($it.tips) { $answer += '<ul>' + (($it.tips | ForEach-Object { '<li>' + (Clean $_) + '</li>' }) -join '') + '</ul>' }
  if ($it.note) { $answer += '<p>' + (Clean $it.note) + '</p>' }
  [ordered]@{ '@type' = 'Question'; name = (Clean $it.q); acceptedAnswer = [ordered]@{ '@type' = 'Answer'; text = $answer } }
}
$json = [ordered]@{ '@context' = 'https://schema.org'; '@type' = 'FAQPage'; mainEntity = @($entities) } | ConvertTo-Json -Depth 6 -Compress
# the theme is XML: escape what XML needs; Blogger outputs the plain JSON
$xmlJson = $json.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;')
$block = "<!-- FAQ-SCHEMA:START (made by scripts/make-faq-schema.ps1 from assets/faq.json; don't edit by hand) -->`r`n" +
  "  <b:if cond='data:view.isHomepage'>`r`n  <script type='application/ld+json'>$xmlJson</script>`r`n  </b:if>`r`n  <!-- FAQ-SCHEMA:END -->"

$theme = [IO.File]::ReadAllText("$root\blogger\theme.xml", $utf8)
$re = '<!-- FAQ-SCHEMA:START[\s\S]*?<!-- FAQ-SCHEMA:END -->'
if ([regex]::IsMatch($theme, $re)) { $theme = [regex]::Replace($theme, $re, { param($m) $block }) }
else { $theme = $theme.Replace('</head>', "  $block`r`n</head>") }
[xml]$null = $theme   # stop here if the result isn't valid XML
[IO.File]::WriteAllText("$root\blogger\theme.xml", $theme, $utf8)
"FAQ schema written: $(@($entities).Count) questions"
