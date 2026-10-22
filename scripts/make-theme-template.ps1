# Makes blogger/theme.template.xml (public) from your own blogger/theme.xml (kept private, see .gitignore).
# Every site-specific value is swapped for a placeholder, so the template can be shared safely.
# Run it after you change theme.xml:   powershell -ExecutionPolicy Bypass -File scripts\make-theme-template.ps1
# Designed & Developed by Nivesh Sahayak (https://www.niveshsahayak.in/). All rights reserved: see LICENSE.
$root = Split-Path $PSScriptRoot -Parent
$utf8 = New-Object Text.UTF8Encoding($false)
$xml = [IO.File]::ReadAllText("$root\blogger\theme.xml", $utf8)

$rules = @(
  # where syg.css / syg.js / groups.json are served from
  @('https://[a-z0-9-]+\.github\.io/[A-Za-z0-9_.-]+/', 'https://YOUR-GITHUB-USER.github.io/YOUR-REPO/'),
  # the Apps Script web app
  @('https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec', 'https://script.google.com/macros/s/YOUR-APPS-SCRIPT-ID/exec'),
  # analytics, ads and search-console style ids
  @('\bG-[A-Z0-9]{8,12}\b', 'G-XXXXXXXXXX'),
  @('ca-pub-\d{10,}', 'ca-pub-0000000000000000'),
  @("<meta content='[^']*' name='yandex-verification'/>", "<meta content='YOUR-YANDEX-CODE' name='yandex-verification'/>"),
  @("disqus: '[^']*'", "disqus: ''"),
  # social profiles and support links
  @('https://www\.instagram\.com/[^''"/\s]+/?', 'https://www.instagram.com/YOUR-PAGE'),
  @('https://www\.facebook\.com/(?!sharer)[^''"/\s]+/?', 'https://www.facebook.com/YOUR-PAGE'),
  @('https://www\.reddit\.com/user/[^''"/\s]+/?', 'https://www.reddit.com/user/YOUR-NAME/'),
  @('https://ko-fi\.com/[^''"/\s]+', 'https://ko-fi.com/YOUR-NAME'),
  # your own domain
  @('https?://(?:www\.)?shareyourgroup\.com', 'https://www.your-domain.com')
)
# The footer credit ("Designed & Developed by Nivesh Sahayak") is kept as it is: see LICENSE.
foreach ($r in $rules) { $xml = [regex]::Replace($xml, $r[0], $r[1]) }

# the promo card gadget: replace your sponsored banner / referral link with a neutral example
$xml = [regex]::Replace($xml, "(<b:widget id='HTML10'[\s\S]*?name='content'><!\[CDATA\[)[\s\S]*?(\]\]>)",
  '${1}<div><b>Your ad or promo here</b><br/>Edit this in Blogger: Layout, "Promo card between groups".<br/><a class="cta-btn" href="#">Call to action</a></div>${2}')

$head = "<?xml version=`"1.0`" encoding=`"UTF-8`" ?>"
$xml = $xml -replace '^\s*<\?xml[^>]*\?>', $head
[IO.File]::WriteAllText("$root\blogger\theme.template.xml", $xml, $utf8)
"blogger/theme.template.xml written ($([math]::Round($xml.Length / 1kb)) KB)"
