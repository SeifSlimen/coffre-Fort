# PowerShell script to pull Ollama model for Coffre-Fort
# Run this after starting docker-compose

Write-Host "Pulling Ollama model: llama3.2:3b" -ForegroundColor Cyan
Write-Host "This may take a few minutes (about 2GB download)..." -ForegroundColor Yellow

docker exec coffre-fort-ollama ollama pull llama3.2:3b

if ($LASTEXITCODE -eq 0) {
    Write-Host "Model pulled successfully!" -ForegroundColor Green
    Write-Host "You can now use the AI summarization features." -ForegroundColor Green
} else {
    Write-Host "Failed to pull model. Please check Ollama service is running." -ForegroundColor Red
    Write-Host "Run: docker logs coffre-fort-ollama" -ForegroundColor Yellow
}

