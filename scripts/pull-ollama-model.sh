#!/bin/bash

# Script to pull Ollama model for the hackathon demo
# Run this after starting docker-compose

echo "Pulling Ollama model: llama3.2:1b"
echo "This may take a few minutes..."

docker exec coffre-fort-ollama ollama pull llama3.2:1b

if [ $? -eq 0 ]; then
    echo "Model pulled successfully!"
    echo "You can now use the AI summarization features."
else
    echo "Failed to pull model. Please check Ollama service is running."
    echo "Run: docker logs coffre-fort-ollama"
fi

