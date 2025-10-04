# Affilitics.co - Project Brief

**Version:** 1.0  
**Status:** 🟡 Stable but requires urgent fixes  
**Date:** October 3, 2025  
**Author:** Mary, Business Analyst

---

## 1. Executive Summary

Affilitics.co is an affiliate marketing analytics platform designed to simplify report generation for marketers by allowing them to upload and process performance data from CSV files. The project is approximately **75% complete**, with core infrastructure including authentication, workspace management, and the data processing pipeline already built.

However, the project is currently **stalled** due to critical environment and configuration issues that block local development and prevent the worker service from functioning. These issues include a deprecated Node.js version, misconfigured database connections, and missing environment variables.

The immediate priority is to resolve these blockers to unfreeze development, stabilize the platform, and proceed with a production deployment. The target is to have a **production-ready version within 2 weeks**, contingent on the swift resolution of these foundational issues.

---

## 2. Problem Statement

Affiliate marketers often receive performance data in raw CSV formats from various networks. Manually consolidating, analyzing, and generating insightful reports from this data is time-consuming, error-prone, and requires specialized spreadsheet skills. 

Existing analytics platforms can be overly complex, expensive, or lack a simple, streamlined workflow for marketers who just need to quickly process CSVs and visualize results. There is a clear need for a tool that focuses specifically on the **CSV-to-report workflow**, enabling marketers to gain actionable insights with minimal friction.

---

## 3. Proposed Solution

Affilitics.co addresses this problem by providing a web platform with a focused feature set:

- **Secure Workspaces:** Users can sign up and create isolated workspaces to manage their data
- **Simple CSV Upload:** A straightforward interface for uploading affiliate marketing data files
- **Automated Data Processing:** An asynchronous worker service that ingests, transforms, and analyzes the uploaded data
- **Insightful Reporting:** A dashboard (to be completed) that visualizes the processed data, providing clear analytics and reports

The solution is built on a modern monorepo architecture using **Next.js**, **Prisma**, and **Supabase**, designed for scalability and maintainability.

---

## 4. MVP Scope & Current Status

The project is near completion for an MVP launch, but requires fixes before it can be considered feature-complete.

### 4.1 Completed Work

- ✅ **Monorepo Architecture:** A well-structured monorepo containing the Next.js frontend, a worker service, and shared packages
- ✅ **Authentication & Workspaces:** Users can register, log in, and manage distinct workspaces
- ✅ **Data Pipeline Foundation:** A robust CSV upload mechanism, job queueing system, and data transformation pipeline are in place
- ✅ **Security Measures:** Middleware for CSRF protection and rate limiting has been implemented
- ✅ **Deployment Configuration:** Vercel deployment configurations are set up

### 4.2 Out of Scope for Immediate Fixes

- Advanced analytics and customizable dashboards
- Direct integration with affiliate network APIs
- User collaboration features within workspaces

---

## 5. Technical Considerations & Dependencies

The technical foundation is solid but requires immediate updates and corrections.

- **Architecture:** Monorepo (Next.js web app + Worker service)
- **Database & Backend:** Supabase is used for the PostgreSQL database, authentication, and file storage. Prisma is the ORM
- **Hosting:** Vercel is configured for deployment
- **Critical Dependency Update:** The environment must be upgraded to **Node.js v20+** as Supabase has deprecated version 18

---

## 6. Current Issues & Blockers

The following issues are preventing further development and deployment:

1. **Blocked Local Development:** The local dev environment is unusable due to a "Port 3000 in use" error, preventing developers from running the application

2. **Failing Worker Service:** The data processing worker fails to start because it is missing essential Supabase environment variables (`SUPABASE_URL` and `SUPABASE_ANON_KEY`)

3. **Deprecated Node.js Version:** The project uses Node.js v18, which is no longer supported by Supabase and poses a security and compatibility risk

4. **Incorrect Database Configuration:** The database URL in the Prisma configuration points to a local instance (`localhost:5432`) instead of the live Supabase connection string, preventing database access

---

## 7. Risks

- **Node.js Compatibility:** Upgrading from v18 to v20+ may introduce subtle breaking changes in dependencies that require testing and resolution

- **Worker Deployment Strategy:** The long-term strategy for deploying the worker (as a separate service vs. a serverless function) needs to be defined to ensure scalability and cost-effectiveness

- **Database Scaling:** As user data grows, the current Supabase plan may need an upgrade to handle the load

- **Security Review:** A formal security review is required before handling sensitive user data in production

---

## 8. Priorities & Next Steps

The critical path to unblock the project is clear and must be executed in the following order:

1. **Fix Development Environment (Urgent):** Resolve the port conflict to enable local development and testing

2. **Upgrade Node.js:** Update the entire project environment to a supported version (v20+)

3. **Configure Environment Variables:** Ensure the worker service and web app have the correct Supabase `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`

4. **End-to-End Pipeline Test:** Perform a full test of the CSV upload, processing, and data storage to ensure the entire pipeline functions correctly

5. **Deploy to Production:** Once all issues are resolved and testing is complete, deploy the application to Vercel

---

## 9. Timeline

- **Current Status:** Slightly delayed due to the critical environmental issues
- **Target:** Production-ready in **2 weeks**, assuming the blockers can be resolved within the next few days

The timeline is highly dependent on the successful execution of the prioritized next steps.

---

*Document prepared by Mary, Business Analyst*  
*Last updated: October 3, 2025*