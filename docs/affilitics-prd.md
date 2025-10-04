# Product Requirements Document (PRD)
**Project:** Affilitics.co  
**Author:** John (PM)  
**Date:** October 3, 2025  
**Status:** Draft  

---

## 1. Background & Context  
Affilitics.co is an affiliate marketing analytics platform designed to simplify report generation for marketers by converting raw CSV data into actionable insights.  

- **Current Status:** ~75% complete, with authentication, workspaces, and data pipeline already built.  
- **Blockers:** Outdated Node.js version, misconfigured database connections, and missing environment variables.  
- **Urgency:** Development is stalled; resolving these blockers is the highest priority to enable stabilization and production release within **2 weeks**.  
- **Market Need:** Marketers face challenges consolidating and analyzing CSV-based affiliate performance data; existing tools are either too complex, costly, or not purpose-built for this workflow.  

---

## 2. Goals & Objectives  
1. Unblock and stabilize development environment to enable continuous progress.  
2. Deliver a **production-ready MVP** within 2 weeks.  
3. Provide a **streamlined CSV-to-report workflow** for affiliate marketers.  
4. Ensure platform scalability for multi-network integrations.  
5. Maintain strong security & privacy practices for handling sensitive data.  

---

## 3. Requirements  

### Functional Requirements  
- **User Management & Authentication**  
  - Sign-up, login, password reset  
  - Workspace creation & role-based access  

- **Data Upload & Processing**  
  - CSV upload (drag-and-drop + file picker)  
  - Schema detection and validation  
  - Automated parsing and normalization  

- **Reporting & Visualization**  
  - Summary dashboards with KPIs (clicks, conversions, revenue)  
  - Filtering by network, campaign, and timeframe  
  - Export to PDF/Excel  

- **System Reliability**  
  - Error handling with user-friendly messages  
  - Retry & recovery for failed uploads  
  - Logging and monitoring system  

### Non-Functional Requirements  
- **Performance:** Process CSVs up to 50MB in <10 seconds.  
- **Scalability:** Support 100+ concurrent workspaces.  
- **Security:** Enforce encrypted storage, secure API endpoints, and RBAC.  
- **Availability:** 99.5% uptime SLA (post-MVP).  

---

## 4. Out of Scope  
- Advanced BI/ETL integrations (Tableau, PowerBI)  
- Machine learning–based predictions  
- Native mobile apps (considered for future roadmap)  

---

## 5. Success Metrics  
- **Technical:** All critical blockers resolved and MVP deployed within 2 weeks.  
- **Adoption:** At least 20 beta users onboarded in first month.  
- **Engagement:** ≥70% repeat usage after first report generated.  
- **Performance:** 90% of CSV uploads processed successfully without error.  

---

## 6. Risks & Mitigation  
- **Development Delays** → Daily sync to unblock engineers; strict prioritization on environment fixes.  
- **Data Privacy Concerns** → Early implementation of security standards (encryption, RBAC).  
- **CSV Schema Variability** → Flexible schema mapping engine; user feedback loop.  
- **Resource Constraints** → Focus on core CSV-to-report MVP; defer advanced features.  

---

## 7. Roadmap & Timeline  
**Week 1–2 (Stabilization):**  
- Fix Node.js version, DB configs, and environment variables  
- Validate worker service and job queue reliability  

**Week 3–4 (MVP Launch):**  
- Complete CSV upload & report generation pipeline  
- Release basic dashboards and exports  
- Onboard closed beta testers  

**Week 5+ (Enhancements):**  
- Multi-network API integrations  
- Advanced visualizations & custom reports  
- Open beta launch  

---

## 8. Stakeholders  
- **Product Manager:** John  
- **Business Analyst:** Mary  
- **Architect:** Winston  
- **UX Expert:** Sally  
- **Developers & QA Team**  
- **End Users:** Affiliate marketers & performance managers  
