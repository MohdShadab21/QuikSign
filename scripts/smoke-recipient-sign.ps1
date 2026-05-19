$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3030'
$token = $env:QUIKSIGN_TOKEN
if (-not $token) {
    Write-Host 'Set QUIKSIGN_TOKEN env var with the signing token first.' -ForegroundColor Yellow
    exit 1
}

Write-Host '1) GET /api/sign/{token} to fetch session and field ids' -ForegroundColor Cyan
$session = Invoke-RestMethod -Uri "$base/api/sign/$token" -Method GET
$envelope = $session.envelope
$signers = $session.signers
$fields = $session.fields
$myFields = $fields | Where-Object { $_.assignedRole -ne 'SENDER' }
Write-Host "Envelope: $($envelope.title) - Fields for recipient: $($myFields.Count)"

Write-Host '2) POST /api/sign as recipient' -ForegroundColor Cyan
$fieldValues = @()
foreach ($f in $myFields) {
    $fieldValues += @{ fieldId = $f.id; value = 'Alice Recipient (typed)' }
}
$signBody = @{
    token            = $token
    signatureType    = 'TYPE'
    signatureValue   = 'Alice Recipient (typed)'
    consentAccepted  = $true
    fieldValues      = $fieldValues
} | ConvertTo-Json -Depth 10
try {
    $resp = Invoke-WebRequest -Uri "$base/api/sign" -Method POST -ContentType 'application/json' -Body $signBody -UseBasicParsing
    Write-Host "Status: $($resp.StatusCode)" -ForegroundColor Green
    Write-Host "Body: $($resp.Content)"
} catch {
    $r = $_.Exception.Response
    if ($r) {
        $sr = New-Object System.IO.StreamReader($r.GetResponseStream())
        Write-Host "Status: $([int]$r.StatusCode)" -ForegroundColor Yellow
        Write-Host "Body: $($sr.ReadToEnd())"
    } else {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}
