# Project TODO

- [x] Reapply the audited legacy findings and architecture notes after workspace recovery.
- [x] Restore the normalized persistent database for boards, specialties, memberships, checklist templates/questions, requests, answers, assignments, decisions, history, snapshots, and attachment metadata.
- [x] Verify the recovered managed database tables/columns and document the migration-journal reconciliation required after workspace recovery.
- [x] Restore Arabic-first bilingual vocabulary, locale resolution, RTL/LTR document direction, and role-aware OAuth authorization helpers.
- [x] Restore the audited permission matrix, legal lifecycle transitions, validation gates, optimistic claiming, immutable history, and snapshots.
- [x] Restore typed tRPC APIs for requests, queues, dashboards, administration, attachments, and secure access references.
- [x] Restore S3-backed document upload/access flows while persisting metadata only.
- [x] Restore boards, specialties, checklist templates/questions, memberships, and global-role administration.
- [x] Restore the Arabic-first responsive dashboard shell, queue, intake, request detail, decisions, timeline, and administration screens.
- [x] Restore English locale switching, localized validation, conflict, forbidden, loading, empty, success, and failure states.
- [x] Add checklist-answer inputs, document upload, queue filters, decision projection, and inline API error treatment if absent after recovery.
- [x] Add Vitest coverage for permissions, legal transitions, validation, optimistic conflicts, and immutable audit drafts.
- [x] Run type checking, all tests, production build, migration verification, and runtime-log review.
- [x] Verify Arabic RTL and English LTR document-direction behavior through desktop and mobile preview captures.
- [x] Read this ledger, mark every completed item, save the final recoverable checkpoint, and deliver the project version.

## Recovery history

- [x] Confirmed the project was restored from checkpoint 11678574 after unsaved workspace changes were cleared.
- [x] Confirmed the source archive remains available under `/home/ubuntu/upload/board-secretariat-ts.zip`.

- [x] Implement remaining audited workflow transitions and protected procedures: release, assign, request-info/response, return flows, board-head submission, withdraw, and archive, each with row-version enforcement and immutable history/snapshot writes.
- [x] Add comprehensive bilingual mutation success feedback plus localized validation, conflict, and forbidden messages across major actions.

- [x] Tighten each remaining transition with per-action work-status and assignee guards and correct actor/assignee updates.
- [x] Define and test the snapshot policy for terminal and board-handoff transitions rather than implying snapshots for every action.
- [x] Add mutation tests for stale versions, forbidden roles, history/snapshot policy, and checklist behavior.

- [x] Complete admin procedures and screens for checklist-question creation, membership deactivation, and global role assignment updates.
- [x] Add signed attachment open/download actions to the detail UI and router contract coverage for the protected attachment namespace.
- [x] Add router contract coverage plus pure tests for stale row versions, forbidden permissions, history/snapshot policy, and checklist behavior.
- [x] Strengthen bilingual inline feedback for checklist, upload, claim, and administration mutations, with generic localized error handling elsewhere.
