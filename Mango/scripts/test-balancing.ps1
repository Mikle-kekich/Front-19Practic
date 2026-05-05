param(
    [string]$Url = "http://127.0.0.1:8080/api/health",
    [int]$Count = 10
)

$responses = @()

for ($i = 1; $i -le $Count; $i++) {
    try {
        $response = Invoke-RestMethod -Uri $Url -Method Get
        $responses += $response
        "{0}. {1} port={2} pid={3}" -f $i, $response.instance, $response.port, $response.pid
    } catch {
        "{0}. request failed: {1}" -f $i, $_.Exception.Message
    }
}

""
"Summary:"
$responses |
    Group-Object instance |
    Sort-Object Name |
    ForEach-Object { "{0}: {1}" -f $_.Name, $_.Count }
