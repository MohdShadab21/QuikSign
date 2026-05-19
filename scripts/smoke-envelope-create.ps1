$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3030'
$headers = @{
    'x-user-id'    = 'user_1'
    'x-user-email' = 'owner@company.com'
    'x-org-id'     = 'org_demo'
}

$documentId = '2e15aea4-0976-494f-8fa0-a9120b95b0fa'

# Simulates the user toggling "I will sign before sending":
# Sender is auto-injected as signer #1 with a pre-filled SENDER signature field.
# Recipient is signer #2 with their own SIGNATURE placeholder.
$body = @{
    title         = 'Smoke test envelope (sender pre-fill)'
    subject       = 'Please sign'
    message       = 'Hello, please sign the document.'
    expiresInDays = 7
    documentId    = $documentId
    signers       = @(
        @{ name = 'Sender'; email = 'owner@company.com'; signingOrder = 1; role = 'SIGNER' },
        @{ name = 'Recipient Alice'; email = 'alice@example.com'; signingOrder = 2; role = 'SIGNER' }
    )
    fields        = @(
        @{
            signerEmail       = 'owner@company.com'
            label             = 'Sender Signature'
            required          = $true
            readOnly          = $true
            prefillValue      = 'Sender Pre-Signed'
            prefilledBySender = $true
            assignedRole      = 'SENDER'
            valueType         = 'SIGNATURE'
            zIndex            = 1
            page              = 1
            x                 = 8
            y                 = 60
            width             = 20
            height            = 8
            type              = 'SIGNATURE'
        },
        @{
            signerEmail       = 'alice@example.com'
            label             = 'Recipient Signature'
            required          = $true
            readOnly          = $false
            prefillValue      = ''
            prefilledBySender = $false
            assignedRole      = 'RECIPIENT'
            valueType         = 'SIGNATURE'
            zIndex            = 2
            page              = 1
            x                 = 50
            y                 = 60
            width             = 20
            height            = 8
            type              = 'SIGNATURE'
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host 'Posting envelope...' -ForegroundColor Cyan
try {
    $resp = Invoke-WebRequest -Uri "$base/api/envelopes" -Method POST -Headers $headers -ContentType 'application/json' -Body $body -UseBasicParsing
    Write-Host "Status: $($resp.StatusCode)" -ForegroundColor Green
    Write-Host "Body: $($resp.Content)"
} catch {
    $r = $_.Exception.Response
    if ($r) {
        $sr = New-Object System.IO.StreamReader($r.GetResponseStream())
        $errBody = $sr.ReadToEnd()
        Write-Host "Status: $([int]$r.StatusCode) $($r.StatusCode)" -ForegroundColor Yellow
        Write-Host "Body: $errBody"
    } else {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}
