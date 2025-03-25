#!/bin/bash

set -e

# Build the Docker image using docker-compose
echo "Building Docker image..."
docker-compose build server
# Check if the local Docker registry is running
echo "Checking if local Docker registry is running..."
if ! curl -s http://localhost:5000/v2/ > /dev/null; then
  echo "Error: Local Docker registry is not running at localhost:5000"
  exit 1
fi
echo "Local Docker registry is running."

# Get the image ID of the newly built image
IMAGE_ID=$(docker images -q backend-server:latest)
if [ -z "$IMAGE_ID" ]; then
  echo "Error: Could not find built image"
  exit 1
fi

# Tag the image for the local registry
echo "Tagging image as localhost:5000/factions-backend:latest"
docker tag $IMAGE_ID localhost:5000/factions-backend:latest

# Push the image to the local registry
echo "Pushing image to localhost:5000/factions-backend:latest"
docker push localhost:5000/factions-backend:latest

echo "Done! Image is now available at localhost:5000/factions-backend:latest" 