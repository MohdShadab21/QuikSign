$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3030'

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [string]$Body
    )
    Write-Host ""
    Write-Host "=== $Name ===" -ForegroundColor Cyan
    try {
        if ($Body) {
            $resp = Invoke-WebRequest -Uri $Url -Method $Method -ContentType 'application/json' -Body $Body -UseBasicParsing -ErrorAction Stop
        } else {
            $resp = Invoke-WebRequest -Uri $Url -Method $Method -UseBasicParsing -ErrorAction Stop
        }
        Write-Host "Status: $($resp.StatusCode)" -ForegroundColor Green
        Write-Host "Body: $($resp.Content)"
    } catch {
        $r = $_.Exception.Response
        if ($r) {
            $sr = New-Object System.IO.StreamReader($r.GetResponseStream())
            $body = $sr.ReadToEnd()
            Write-Host "Status: $([int]$r.StatusCode) $($r.StatusCode)" -ForegroundColor Yellow
            Write-Host "Body: $body"
        } else {
            Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Test-Endpoint 'sign-GET-invalid' 'GET' "$base/api/sign/bogus_token_too_short" $null

Test-Endpoint 'sign-POST-invalid-token' 'POST' "$base/api/sign" '{"token":"bogus_token_that_is_long_enough_xxx","signatureType":"TYPE","consentAccepted":true,"fieldValues":[]}'

Test-Endpoint 'sign-POST-validation-error' 'POST' "$base/api/sign" '{"token":"short","signatureType":"TYPE","consentAccepted":true,"fieldValues":[]}'

Test-Endpoint 'decline-POST-invalid-token' 'POST' "$base/api/sign/decline" '{"token":"bogus_token_that_is_long_enough_xxx","reason":"testing"}'

Test-Endpoint 'envelopes-POST-no-auth' 'POST' "$base/api/envelopes" '{"title":"x","documentId":"00000000-0000-0000-0000-000000000000","signers":[{"name":"a","email":"a@b.com","signingOrder":1,"role":"SIGNER"}],"fields":[]}'

Test-Endpoint 'preset-POST-no-fields' 'POST' "$base/api/sign/presets" '{"token":"bogus_token_that_is_long_enough_xxx","label":"My Default"}'

Test-Endpoint 'preset-POST-with-signature' 'POST' "$base/api/sign/presets" '{"token":"bogus_token_that_is_long_enough_xxx","label":"My Default","signatureValue":"data:image/png;base64,iVBORw0K"}'
