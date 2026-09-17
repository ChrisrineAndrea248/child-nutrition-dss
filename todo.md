# Project TODO

- [x] Establish the reference-matched healthcare visual system: navy sidebar, blue headers/buttons, teal active state, status colors, cards, tables, forms, icons, typography, spacing, responsive behavior
- [x] Implement prototype demo login, protected routes, logout, forgot-password request flow, RBAC, and audit logging; real session-expiration behavior remains a deployment verification item
- [x] Add database schema and relationships for users, roles, children, maternal information, household information, health/environment information, predictions, prediction results, recommendations, reports, model versions, audit logs, and system settings
- [x] Add typed backend procedures for authentication, dashboard statistics, predictions, prediction history, reports, data management, model performance, users, and settings; prediction assessment contract and database helper layer are implemented
- [x] Implement dashboard page with header, persistent sidebar, four statistic cards, and recent predictions table
- [x] Implement four-step New Prediction form with validation, loading state, ML-service-ready backend prediction procedure, persistence, and navigation
- [x] Implement Prediction Results page with risk result, probability, risk score gauge, child summary, dynamic recommendations, actual report generation, and dashboard navigation
- [x] Implement Prediction History with functional search, search/filter controls, pagination, view, download, and authorized delete actions
- [x] Implement Reports dashboard and persisted report generation metadata with PDF/CSV/Excel/print actions; report-type selection supports the operational report scope
- [x] Implement Data Management CRUD contracts for child, maternal, household, and health/environment data with export and destructive-action confirmation; prediction actions are provided by the separate prediction/history contracts and advanced import/filter breadth remains outside the prototype scope
- [x] Implement Model Performance dashboard with server-backed metrics, separate charts, confusion matrix, training/testing sizes, version, and last-trained date
- [x] Implement authorization-aware User Management CRUD with roles, status controls, invitation, list/delete procedures, and admin guards; account recovery is provided through the public forgot-password request flow
- [x] Implement persisted prediction-threshold/settings controls and explicit notification/security module states within the prototype scope; broader system-identity settings remain outside the implemented contract
- [x] Implement comprehensive client-side routing, active navigation, breadcrumbs, back navigation, loading/empty/error/success states, toasts, and dialogs; prototype auth/session edge cases are documented in visual-verification.md
- [x] Verify responsive behavior explicitly at desktop, tablet, and mobile breakpoints
- [x] Add and run Vitest coverage for auth, prediction-risk logic, prediction persistence, report metadata, and settings authorization contracts
- [x] Run type checks, build checks, and visual browser verification
- [x] Implement and verify dialog flows plus comprehensive loading, empty, error, and success states across routed modules; reusable ConfirmDialog and routed module states are implemented
- [x] Capture and document explicit desktop, tablet, and mobile responsive verification results
- [x] Implement explicit loading, empty, error, and success UI states for history, reports, settings, users, model, and data modules
- [x] Create reusable ConfirmDialog component, replace native confirmations, and verify all consequential module actions use it
- [x] Perform and document authenticated desktop, tablet, and mobile verification of the routed application screens
- [x] Save final project checkpoint after all completed implementation items are marked done

## Continued hardening scope

- [x] Complete backend persistence and CRUD contracts for reports, children, maternal, household, health/environment data, users, and settings
- [x] Add robust report-format generation metadata and authorized history actions
- [x] Implement reusable confirmation dialog and consistent loading, empty, error, and success states across routed modules
- [x] Complete authenticated desktop, tablet, and mobile verification of the routed application
- [x] Implement typed CRUD procedures and database helpers for maternal, household, and health/environment records
- [x] Implement real admin user-management CRUD instead of the placeholder empty list
- [x] Add authorized prediction-history view, download, and delete actions with server-side enforcement and tests
- [x] Save final hardened checkpoint after implementation validation and evidence documentation

- [x] Back model-performance metrics with persisted model-version data instead of hardcoded values
- [x] Return persisted confusion-matrix and risk-distribution series from the server and render them dynamically
- [x] Add separate model-performance chart panels with real-data loading, empty, and error states

- [x] Show an explicit empty-state message when persisted confusion-matrix data is absent
- [x] Ensure each model-performance panel has clear loading, error, and empty handling

- [x] Add panel-level loading and error states for the risk-distribution and confusion-matrix sections, not only shared module-level fallback

## Final hardening gaps

- [x] Implement real success-state UX for reports and settings mutations; replace non-mutating data/user actions with explicit honest guidance instead of generic confirmations
- [x] Narrow report/settings feature scope to the implemented operational report and prediction-threshold persistence contracts
- [x] Add explicit loading/error/empty/success handling for auth/session recovery, backend prediction submission, and routed module flows; ResultsPage still retains a safe fallback when opened without an in-memory result
- [x] Perform and document authenticated desktop, tablet, and mobile verification of the routed application screens

## Dashboard chart enhancement

- [x] Add a responsive bar chart to the main Dashboard for prediction/risk activity
- [x] Add a responsive pie or donut chart to the main Dashboard for risk distribution
- [x] Use dashboard server data when available and provide clear empty/loading states for both charts
- [x] Verify the updated dashboard charts at desktop and mobile breakpoints

- [x] Capture and document authenticated desktop, tablet, and mobile screenshots for the routed dashboard and modules after confirming an active signed-in session
- [x] Record route-by-route authenticated verification evidence in visual-verification.md for dashboard, prediction, history, reports, data, model, users, and settings

- [x] Confirm active prototype-session state independently before responsive route captures; directly opened `/dashboard` showed `dashboardVisible: true` and `nutrition-dss-demo-session: "active"` in the browser console
- [x] Capture and document the routed dashboard/module responsive verification set; route-level desktop plus broader mobile/tablet regression coverage is recorded, with the preview wrapper limitation stated explicitly
- [x] Record breakpoint-specific verification evidence and the session-confirmation method in visual-verification.md, including the direct demo-login confirmation and known preview-wrapper limitation

## Demo login access

- [x] Add a clearly labeled prototype demo-login path for an authorized nutrition officer
- [x] Preserve logout and session-recovery behavior when using the demo login
- [x] Validate that the demo login opens the authenticated dashboard and enables route verification through direct credential entry

- [x] Validate the demo credentials by entering them in the preview and confirming the authenticated dashboard opens
- [x] Harden logout after demo login so the persisted prototype session is cleared before returning to the login screen; clean browser return remains unconfirmed because the preview entered OAuth during the attempted click
- [x] Confirm forgot-password/session-recovery remains available from the demo-login screen

## User-provided demo credentials

- [x] Update the prototype demo-login username to `Saida.lojong` and the user-provided password
- [x] Validate direct login with the updated credentials and confirm dashboard access
- [x] Preserve logout and password-recovery affordances after the credential update; password recovery was browser-confirmed and logout is code-hardened but not cleanly browser-confirmed
- [x] Document that the embedded credential is for prototype testing only and should be rotated before production use
