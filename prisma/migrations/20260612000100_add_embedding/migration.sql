-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to items table
ALTER TABLE "items" ADD COLUMN "embedding" vector(768);
