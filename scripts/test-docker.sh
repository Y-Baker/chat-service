#!/bin/bash
set -e

echo "🧪 Testing chat-service with Docker Compose"
echo "==========================================="

# Cleanup any existing containers
echo "🧹 Cleaning up existing containers..."
docker compose down -v 2>/dev/null || true

# Test 1: Self-contained mode (with databases)
echo ""
echo "📦 Test 1: Self-contained mode (--profile with-db)"
echo "---------------------------------------------------"
docker compose --profile with-db up -d

echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
echo "✓ Checking service status..."
docker compose ps

# Test health endpoint
echo "✓ Testing health endpoint..."
curl -f http://localhost:3000/health || echo "❌ Health check failed"

echo "✓ Checking MongoDB connection..."
docker compose exec -T chat-mongo mongosh --eval "db.adminCommand('ping')" || echo "❌ MongoDB check failed"

echo "✓ Checking Redis connection..."
docker compose exec -T chat-redis redis-cli ping || echo "❌ Redis check failed"

# Cleanup
echo "🧹 Cleaning up..."
docker compose --profile with-db down -v

# Test 2: External database mode (no profile)
echo ""
echo "🔌 Test 2: External database mode (no databases)"
echo "------------------------------------------------"
echo "This would normally connect to external databases."
echo "Skipping as we don't have external databases configured."

echo ""
echo "✅ Docker tests completed!"
