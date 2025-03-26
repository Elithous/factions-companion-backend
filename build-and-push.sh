#!/bin/bash

set -e

# Check if registry address is provided
if [ $# -eq 0 ]; then
  echo "Error: Registry address not provided"
  echo "Usage: $0 <registry-address>"
  exit 1
fi

REGISTRY_ADDR=$1

# Build the Docker image using docker-compose
echo "Building Docker image..."
docker-compose build server

# Check if the Docker registry is running
echo "Checking if Docker registry is running at $REGISTRY_ADDR..."
if ! curl -s http://$REGISTRY_ADDR/v2/ > /dev/null; then
  echo "Error: Docker registry is not running at $REGISTRY_ADDR"
  exit 1
fi
echo "Docker registry is running."

# Get the image ID of the newly built image
IMAGE_ID=$(docker images -q backend-server:latest)
if [ -z "$IMAGE_ID" ]; then
  echo "Error: Could not find built image"
  exit 1
fi

# Tag the image for the registry
echo "Tagging image as $REGISTRY_ADDR/factions-backend:latest"
docker tag $IMAGE_ID $REGISTRY_ADDR/factions-backend:latest

# Push the image to the registry
echo "Pushing image to $REGISTRY_ADDR/factions-backend:latest"
docker push $REGISTRY_ADDR/factions-backend:latest

echo "Done! Image is now available at $REGISTRY_ADDR/factions-backend:latest"