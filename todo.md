# Project TODO

- [x] Reapply the audited legacy findings and architecture notes after workspace recovery.
- [x] Restore the normalized persistent database for boards, specialties, memberships, checklist templates/questions, requests, answers, assignments, decisions, history, snapshots, and attachment metadata.
- [ ] Restore reviewed Drizzle migrations and apply them idempotently to the managed database.
- [x] Restore Arabic-first bilingual vocabulary, locale resolution, RTL/LTR document direction, and role-aware OAuth authorization helpers.
- [x] Restore the audited permission matrix, legal lifecycle transitions, validation gates, optimistic claiming, immutable history, and snapshots.
- [ ] Restore typed tRPC APIs for requests, queues, dashboards, administration, locale preferences, attachments, and secure access references.
- [ ] Restore S3-backed document upload/access flows while persisting metadata only.
- [ ] Restore boards, specialties, checklist templates/questions, memberships, and global-role administration.
- [x] Restore the Arabic-first responsive dashboard shell, queue, intake, request detail, decisions, timeline, and administration screens.
- [x] Restore English locale switching, localized validation, conflict, forbidden, loading, empty, success, and failure states.
- [ ] Add checklist-answer inputs, document upload, queue filters, decision projection, and inline API error treatment if absent after recovery.
- [x] Add Vitest coverage for permissions, legal transitions, validation, optimistic conflicts, and immutable audit drafts.
- [x] Run type checking, all tests, production build, migration verification, and runtime-log review.
- [ ] Verify Arabic RTL and English LTR behavior at desktop and mobile widths.
- [ ] Read this ledger, mark every completed item, save the final recoverable checkpoint, and deliver the project version.

## Recovery history

- [x] Confirmed the project was restored from checkpoint 11678574 after unsaved workspace changes were cleared.
- [x] Confirmed the source archive remains available under `/home/ubuntu/upload/board-secretariat-ts.zip`.

- [x] Implement remaining audited workflow transitions and protected procedures: release, assign, request-info/response, return flows, board-head submission, withdraw, and archive, each with row-version enforcement and immutable history/snapshot writes.
- [x] Add comprehensive bilingual mutation success feedback plus localized validation, conflict, and forbidden messages across major actions.

- [ ] Tighten each remaining transition with per-action work-status and assignee guards and correct actor/assignee updates.
- [ ] Define and test the snapshot policy for terminal and board-handoff transitions rather than implying snapshots for every action.
- [ ] Add mutation tests for stale versions, forbidden roles, history writes, and snapshot writes.
