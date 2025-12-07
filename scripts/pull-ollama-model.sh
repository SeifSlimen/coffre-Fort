#!/bin/bash

# Script to pull Ollama model for Coffre-Fort
# Run this after starting docker-compose

echo "Pulling Ollama model: llama3.2:3b"
echo "This may take a few minutes (about 2GB download)..."

docker exec coffre-fort-ollama ollama pull llama3.2:3b

if [ $? -eq 0 ]; then
    echo "Model pulled successfully!"
    echo "You can now use the AI summarization features."
else
    echo "Failed to pull model. Please check Ollama service is running."
    echo "Run: docker logs coffre-fort-ollama"
fi

