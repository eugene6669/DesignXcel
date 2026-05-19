# DesignXcel Capstone Paper (Aligned to Implemented System)

## Title
**DesignXcel: A Web-Based E-Commerce and Inventory Management System with Content Management Features for Design Excellence Home and Office System Company**

## Abstract
This capstone project presents DesignXcel, a web-based e-commerce and inventory management system developed for Design Excellence Home and Office System Company. The project addresses key operational issues observed in the client environment, including manual and fragmented inventory tracking, limited website content control, and inefficient order and customer communication workflows. The system integrates customer-facing shopping features with administrative tools for inventory, content, and order management.

The implemented platform includes role-based access control, JWT-based authentication, OTP-assisted account flows, product and order modules, checkout workflows, and integrated online payment processing. It also supports administrative operations such as content updates, stock monitoring, and transactional visibility. Supporting services include email notifications and cloud media handling for improved communication and asset management.

System evaluation focuses on functional correctness, usability, and reliability within the intended deployment scope. Results indicate that the solution improves operational efficiency, strengthens inventory visibility, and provides a more consistent digital purchasing experience for customers. The study concludes that the implemented DesignXcel platform is a viable and scalable baseline for ongoing digital transformation of furniture retail and inventory operations.

## Chapter 1: Introduction

### 1.1 Project Context
Design Excellence Home and Office System Company requires an integrated digital platform to support both customer transactions and internal operations. Prior workflows relied on disconnected tools and manual processes for stock monitoring, product updates, and order follow-ups. This setup introduced delays, data inconsistencies, and high dependency on staff intervention.

At the same time, customer expectations have shifted toward responsive online storefronts, transparent order status, and secure digital payments. To remain competitive, the business needs a platform that unifies e-commerce, inventory oversight, and content administration while preserving control over product presentation and workflow management.

DesignXcel was developed as this integrated platform. It combines front-end customer purchasing experiences with back-office modules for inventory and content workflows.

### 1.2 Purpose and Description of the Project
The purpose of this study is to design, develop, and evaluate a web-based platform that combines:
- e-commerce product browsing and checkout,
- inventory-aware order handling,
- role-based administrative controls, and
- content management operations for business users.

The system is implemented as a full-stack web solution with a React-based client interface and a Node.js backend service layer.

### 1.3 General Objective
To develop a functional and secure web-based e-commerce and inventory management system that improves business operations and customer experience for Design Excellence.

### 1.4 Specific Objectives
- Build a responsive storefront for product browsing, account access, cart, and checkout.
- Implement authenticated and role-protected workflows using JWT and access controls.
- Provide account-security-related flows including OTP/email-assisted processes.
- Implement order handling and payment workflows aligned with current integrations.
- Support inventory-related operational visibility for administrative users.
- Provide content and product management capabilities for non-developer administrators.
- Improve operational communication through transactional email notifications.

### 1.5 Scope and Limitations
**Scope**
- Web-based customer and admin platform.
- User authentication and protected route access.
- Product browsing, cart, checkout, and order completion flow.
- Payment integration flows currently configured in the system.
- Inventory and order administration modules.
- Content and media management support.
- Notification and account-related email capabilities.

**Limitations**
- The platform is internet-dependent.
- Availability and reliability of some features depend on third-party providers (payment gateways, email services, cloud media services).
- Native mobile application is not included in the current implementation scope.
- Feature behavior may vary depending on environment configuration and deployed service credentials.

## Chapter 2: Review of Related Literature and Systems

### 2.1 Related Literature
Recent studies and industry reports consistently identify digital transformation, unified inventory systems, and omnichannel purchasing as key drivers for retail resilience and growth. Furniture and manufacturing-adjacent businesses benefit from integrating online sales with real-time operational data to reduce order errors and improve customer trust.

### 2.2 Related Systems
Comparable platforms emphasize:
- centralized product and stock records,
- secure customer account handling,
- integrated payment and order lifecycle updates,
- and admin-side reporting and content maintenance.

These findings support the DesignXcel architectural direction: one platform that bridges front-end commerce and back-office operations.

### 2.3 Synthesis
The literature and system review support the need for a combined e-commerce and operations platform rather than separate standalone tools. DesignXcel aligns with this direction by integrating customer purchase flows, operational controls, and maintainable content workflows in one system.

## Chapter 3: Methodology

### 3.1 Development Approach
The project followed a structured software development process with iterative validation against stakeholder requirements. Core phases included:
- requirements definition,
- interface and data design,
- feature development,
- integration,
- and testing/evaluation.

### 3.2 Technical Stack (Aligned to Current System)
- Frontend: React-based web client.
- Backend: Node.js/Express API services.
- Authentication and session model: JWT-based access handling.
- Account and email flows: OTP and notification support via email service integration.
- Payment flow: integrated online checkout services (including existing Stripe flow and current PayMongo integration work).
- Media handling: cloud object storage integration for managed assets.
- Admin operations: role-protected pages and modules for inventory/order/content activities.

### 3.3 Requirements Analysis Summary
From stakeholder interviews and workflow validation, the critical requirements were:
- secure user access and role isolation,
- reliable product and order visibility,
- practical admin controls for content and inventory activities,
- and a seamless customer checkout journey with online payment options.

### 3.4 System Design Summary
The designed architecture separates concerns across:
- client interface modules (customer and account pages),
- API and business logic modules,
- utility/service integrations (auth, email, storage, payment),
- and operational interfaces for administrators.

This modular setup supports maintainability and phased enhancement.

## Chapter 4: Results and Discussion

### 4.1 Implementation Results
The implemented DesignXcel system delivers a unified user experience from account access to order completion. Customer workflows include secure login, protected page access, cart and checkout processing, and order confirmation paths. Admin and internal workflows support monitoring and managing core business data and activities.

### 4.2 Functional Outcomes
Implemented capabilities in the current project state include:
- authentication and protected-route control,
- account security settings and credential-related handling,
- checkout and payment service integration paths,
- order success and post-checkout handling,
- utility services for email-based communication,
- cloud media and supporting backend utilities,
- and role-focused operational interfaces.

### 4.3 Operational Impact
Compared with manual/disconnected processes, the system provides:
- improved transaction traceability,
- faster updates for content and catalog-related changes,
- clearer order and payment flow handling,
- and reduced dependency on ad hoc manual coordination.

### 4.4 Discussion
The system demonstrates that combining e-commerce and inventory-oriented administration into a single web platform improves consistency and control for both customers and staff. Current architecture decisions also support extensibility for future analytics, reporting enhancements, and broader automation.

## Chapter 5: Conclusion and Recommendations

### 5.1 Conclusion
DesignXcel successfully aligns with the core business and technical needs of Design Excellence by implementing a web-based platform that connects customer purchasing flows with internal operational controls. The project addresses major pain points in website management, order handling, and inventory-related operations through integrated modules and service-based architecture.

The implemented system is functionally viable and suitable as a production-oriented baseline, with clear pathways for incremental improvement.

### 5.2 Recommendations
- Expand automated reporting and KPI dashboards for inventory and sales trends.
- Strengthen audit and activity logging depth for compliance and internal controls.
- Continue payment flow hardening and fallback handling for third-party service failures.
- Add more robust accessibility and UX refinements across high-traffic workflows.
- Introduce a formal regression test suite covering auth, checkout, and order lifecycle paths.
- Plan staged deployment and performance monitoring to support long-term scalability.

## References (Working Section)
Retain and clean the references from the current manuscript. For final defense submission, validate publication years, publisher/source quality, URL accessibility, and citation format required by your school.

## Appendix Draft Guide (for your final document package)
- Appendix A: Client letters, endorsements, and project photos.
- Appendix B: Selected relevant source code excerpts.
- Appendix C: Test cases and evaluation instruments.
- Appendix D: Sample input/output and report screenshots.
- Appendix E: User guide for customer and admin roles.
- Appendix F: Proponents’ technical vitae.
