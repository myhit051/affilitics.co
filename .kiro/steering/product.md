# Product Overview

Affilitics is an affiliate marketing analytics platform that processes CSV data from e-commerce platforms (Shopee, Lazada, TikTok) and transforms it into actionable metrics.

## Core Workflow
1. **Upload**: Users upload CSV files containing affiliate order data
2. **Staging**: Raw data is parsed and stored in platform-specific staging tables
3. **Transform**: Staging data is normalized into a unified `affiliate_orders` table
4. **Metrics**: Daily aggregated metrics are calculated for reporting and analysis

## Key Features
- Multi-platform support (Shopee, Lazada, TikTok)
- Workspace-based multi-tenancy with RLS security
- Asynchronous file processing via background worker
- Real-time metrics calculation and summarization
- Supabase integration for auth, storage, and database

## Security Model
- Row Level Security (RLS) enforced on all user data tables
- Workspace-based data isolation
- JWT authentication with workspace context headers
- Service role access for background processing