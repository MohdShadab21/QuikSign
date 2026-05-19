$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3030'
$headers = @{
    'x-user-id'    = 'user_1'
    'x-user-email' = 'owner@company.com'
    'x-org-id'     = 'org_demo'
}
$documentId = '2e15aea4-0976-494f-8fa0-a9120b95b0fa'

Write-Host '1) Create envelope with TWO recipients (so it stays SENT after the first signs)' -ForegroundColor Cyan
$body = @{
    title         = 'Snapshot download test'
    expiresInDays = 7
    documentId    = $documentId
    signers       = @(
        @{ name = 'Recipient One'; email = 'recipient-one@example.org'; signingOrder = 1; role = 'SIGNER' },
        @{ name = 'Recipient Two'; email = 'recipient-two@example.org'; signingOrder = 2; role = 'SIGNER' }
    )
    fields        = @(
        @{ signerEmail = 'recipient-one@example.org'; label = 'Sig 1'; required = $true; readOnly = $false; prefillValue = ''; prefilledBySender = $false; assignedRole = 'RECIPIENT'; valueType = 'SIGNATURE'; zIndex = 1; page = 1; x = 10; y = 70; width = 20; height = 8; type = 'SIGNATURE' },
        @{ signerEmail = 'recipient-two@example.org'; label = 'Sig 2'; required = $true; readOnly = $false; prefillValue = ''; prefilledBySender = $false; assignedRole = 'RECIPIENT'; valueType = 'SIGNATURE'; zIndex = 2; page = 1; x = 50; y = 70; width = 20; height = 8; type = 'SIGNATURE' }
    )
} | ConvertTo-Json -Depth 10
$resp = Invoke-RestMethod -Uri "$base/api/envelopes" -Method POST -Headers $headers -ContentType 'application/json' -Body $body
$envelopeId = $resp.envelopeId
$signingLink = $resp.signingLink
$token = $signingLink -replace '.*/sign/', ''
Write-Host "Envelope: $envelopeId  Token: $token"

Write-Host '2) GET signing session to fetch field id for Recipient One' -ForegroundColor Cyan
$session = Invoke-RestMethod -Uri "$base/api/sign/$token" -Method GET
$fieldId = ($session.envelope.fields | Where-Object { $_.signerEmail -eq 'recipient-one@example.org' } | Select-Object -First 1).id
Write-Host "FieldId for Recipient One: $fieldId"

Write-Host '3) POST /api/sign as Recipient One (first of two signers)' -ForegroundColor Cyan
$signBody = @{
    token           = $token
    signatureType   = 'TYPE'
    signatureValue  = 'Recipient One typed signature'
    consentAccepted = $true
    fieldValues     = @(
        @{ fieldId = $fieldId; value = 'Recipient One typed signature' }
    )
} | ConvertTo-Json -Depth 10
$signResp = Invoke-RestMethod -Uri "$base/api/sign" -Method POST -ContentType 'application/json' -Body $signBody
$signResp | ConvertTo-Json

Write-Host '4) Inspect envelope state - should be SENT (not COMPLETED) because Recipient Two is still pending' -ForegroundColor Cyan
$envState = Invoke-RestMethod -Uri "$base/api/envelopes/$envelopeId" -Method GET -Headers $headers
Write-Host "Status: $($envState.envelope.status)  signedCloudinaryId: $($envState.envelope.signedCloudinaryId)"
$envState.envelope.signers | ForEach-Object { Write-Host "  $($_.name) -> $($_.status)" }

Write-Host '5) Hit /api/sign/{token}/download - should return a PDF snapshot with Recipient One signature' -ForegroundColor Cyan
$tmpPath = Join-Path $env:TEMP 'snapshot-test.pdf'
$dl = Invoke-WebRequest -Uri "$base/api/sign/$token/download" -Method GET -OutFile $tmpPath -UseBasicParsing -PassThru
Write-Host "HTTP Status: $($dl.StatusCode)  Content-Type: $($dl.Headers['Content-Type'])"
$fi = Get-Item $tmpPath
Write-Host "Downloaded $($fi.Length) bytes to $tmpPath"
$bytes = [System.IO.File]::ReadAllBytes($tmpPath)
$prefix = [System.Text.Encoding]::ASCII.GetString($bytes[0..7])
Write-Host "PDF header bytes: $prefix"
if ($prefix.StartsWith('%PDF')) {
    Write-Host 'OK: response is a valid PDF.' -ForegroundColor Green
} else {
    Write-Host 'FAIL: response is not a PDF.' -ForegroundColor Red
}
