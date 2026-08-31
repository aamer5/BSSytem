# Board Secretariat Platform — Recovery Implementation

This project is a full-stack React, Express, tRPC, Drizzle, and Manus OAuth workspace rebuilt from `board-secretariat-ts.zip` after the sandbox was restored from the initial project checkpoint.

## Delivered foundation

The managed database contains persistent tables for boards, specialties, board memberships, checklist templates and questions, subject requests, checklist answers and edits, assignments, decisions, request history, snapshots, and attachment metadata. Domain tables use UTC epoch milliseconds; authentication retains the scaffold's timestamp contract.

The backend exposes typed procedures for authentication, reference data, dashboard summaries, searchable request queues, request details, draft intake, optimistic claiming, submission, decisions, and administrator reference-data operations. Board access is checked through active board memberships, while global administrators receive read/administration access but cannot decide a request through the board-head action.

State changes use row versions, actor-scoped permission checks, legal transition guards, and immutable history/snapshot drafts. Attachment records contain object-storage keys and access references only; file bytes are not stored in the database.

## Interface

The workspace is Arabic-first and sets `dir="rtl"` for Arabic and `dir="ltr"` for English. It includes dashboard summaries, request queue filters, request intake, request details with decisions and audit history, and an administrator surface. The visual system uses warm paper surfaces, deep teal, restrained brass accents, Arabic-friendly typography, responsive cards, and mobile navigation.

## Operational note

Preview verification confirms the client renders the Manus OAuth sign-in state. The preview session was not authenticated, so authenticated data screens require the user to complete Manus OAuth in the browser before end-to-end data-flow testing. Type checking, 9 Vitest assertions, and the production build pass.
