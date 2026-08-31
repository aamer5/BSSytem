CREATE TABLE `boardMemberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`boardId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('requester','secretary_member','secretariat_head','board_member','board_head') NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `boardMemberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `board_memberships_scope_unique` UNIQUE(`boardId`,`userId`,`role`)
);
--> statement-breakpoint
CREATE TABLE `boards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(40) NOT NULL,
	`nameAr` varchar(255) NOT NULL,
	`nameEn` varchar(255),
	`descriptionAr` text,
	`descriptionEn` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `boards_id` PRIMARY KEY(`id`),
	CONSTRAINT `boards_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `checklistAnswerEdits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`checklistAnswerId` int NOT NULL,
	`editedByUserId` int NOT NULL,
	`previousValue` json,
	`newValue` json,
	`editedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `checklistAnswerEdits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `checklistAnswers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectRequestId` int NOT NULL,
	`checklistQuestionId` int NOT NULL,
	`answerValue` json,
	`finalConfirmation` boolean NOT NULL DEFAULT false,
	`responseDate` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `checklistAnswers_id` PRIMARY KEY(`id`),
	CONSTRAINT `checklist_answers_question_unique` UNIQUE(`subjectRequestId`,`checklistQuestionId`)
);
--> statement-breakpoint
CREATE TABLE `checklistQuestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`checklistTemplateId` int NOT NULL,
	`code` varchar(80) NOT NULL,
	`textAr` text NOT NULL,
	`textEn` text,
	`answerType` enum('text','long_text','numeric','boolean','single_select','multi_select','document_linked') NOT NULL,
	`optionsJson` json,
	`showIfJson` json,
	`linkedDocumentType` varchar(80),
	`sortOrder` int NOT NULL DEFAULT 0,
	`required` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `checklistQuestions_id` PRIMARY KEY(`id`),
	CONSTRAINT `checklist_questions_code_unique` UNIQUE(`checklistTemplateId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `checklistTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`boardId` int NOT NULL,
	`specialtyId` int,
	`subjectType` varchar(32),
	`version` int NOT NULL,
	`nameAr` varchar(255) NOT NULL,
	`nameEn` varchar(255),
	`status` enum('draft','active','retired') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`activatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `checklistTemplates_id` PRIMARY KEY(`id`),
	CONSTRAINT `checklist_templates_scope_version_unique` UNIQUE(`boardId`,`specialtyId`,`subjectType`,`version`)
);
--> statement-breakpoint
CREATE TABLE `requestAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectRequestId` int NOT NULL,
	`assigneeUserId` int NOT NULL,
	`assigneeRole` varchar(40) NOT NULL,
	`assignedByUserId` int NOT NULL,
	`status` enum('active','released','completed') NOT NULL DEFAULT 'active',
	`note` text,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`releasedAt` timestamp,
	CONSTRAINT `requestAssignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `requestAttachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectRequestId` int NOT NULL,
	`uploadedByUserId` int NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`accessReference` varchar(1000),
	`originalFileName` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`byteSize` int NOT NULL,
	`documentType` varchar(80) NOT NULL,
	`requesterVisible` boolean NOT NULL DEFAULT false,
	`reviewStatus` enum('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
	`isActive` boolean NOT NULL DEFAULT true,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`replacedAttachmentId` int,
	CONSTRAINT `requestAttachments_id` PRIMARY KEY(`id`),
	CONSTRAINT `request_attachments_storage_key_unique` UNIQUE(`storageKey`)
);
--> statement-breakpoint
CREATE TABLE `requestDecisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectRequestId` int NOT NULL,
	`outcome` enum('proper','not_proper') NOT NULL,
	`reasonCode` varchar(80) NOT NULL,
	`note` text NOT NULL,
	`decidedByUserId` int NOT NULL,
	`requesterVisible` boolean NOT NULL DEFAULT true,
	`decidedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `requestDecisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `requestHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectRequestId` int NOT NULL,
	`actorUserId` int NOT NULL,
	`actorRoleAtTime` varchar(40) NOT NULL,
	`action` varchar(60) NOT NULL,
	`beforeState` json NOT NULL,
	`afterState` json NOT NULL,
	`note` text,
	`correlationId` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `requestHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `requestSnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectRequestId` int NOT NULL,
	`revision` int NOT NULL,
	`content` json NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `requestSnapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `specialties` (
	`id` int AUTO_INCREMENT NOT NULL,
	`boardId` int NOT NULL,
	`code` varchar(40) NOT NULL,
	`nameAr` varchar(255) NOT NULL,
	`nameEn` varchar(255),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `specialties_id` PRIMARY KEY(`id`),
	CONSTRAINT `specialties_board_code_unique` UNIQUE(`boardId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `subjectRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referenceNumber` varchar(80) NOT NULL,
	`boardId` int NOT NULL,
	`specialtyId` int NOT NULL,
	`requesterUserId` int NOT NULL,
	`checklistTemplateId` int,
	`checklistTemplateVersion` int,
	`title` varchar(500) NOT NULL,
	`subjectType` varchar(32) NOT NULL,
	`priority` varchar(20) NOT NULL DEFAULT 'normal',
	`confidentialityLevel` varchar(20) NOT NULL DEFAULT 'standard',
	`lifecycleStatus` varchar(40) NOT NULL DEFAULT 'draft',
	`workStatus` varchar(40) NOT NULL DEFAULT 'unassigned',
	`currentAssigneeId` int,
	`assignedSecretaryMemberId` int,
	`requesterOrganization` varchar(255),
	`description` text,
	`background` text,
	`objective` text,
	`requestedOutcome` text,
	`secretaryFindings` text,
	`summary` text,
	`recommendations` text,
	`internalNotes` text,
	`rowVersion` int NOT NULL DEFAULT 1,
	`revision` int NOT NULL DEFAULT 1,
	`correlationId` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`submittedAt` timestamp,
	`closedAt` timestamp,
	CONSTRAINT `subjectRequests_id` PRIMARY KEY(`id`),
	CONSTRAINT `subject_requests_reference_unique` UNIQUE(`referenceNumber`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`preferredLocale` enum('ar','en') NOT NULL DEFAULT 'ar',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE INDEX `board_memberships_user_idx` ON `boardMemberships` (`userId`);--> statement-breakpoint
CREATE INDEX `board_memberships_board_idx` ON `boardMemberships` (`boardId`);--> statement-breakpoint
CREATE INDEX `checklist_answers_request_idx` ON `checklistAnswers` (`subjectRequestId`);--> statement-breakpoint
CREATE INDEX `checklist_questions_template_idx` ON `checklistQuestions` (`checklistTemplateId`);--> statement-breakpoint
CREATE INDEX `checklist_templates_board_idx` ON `checklistTemplates` (`boardId`);--> statement-breakpoint
CREATE INDEX `request_assignments_request_idx` ON `requestAssignments` (`subjectRequestId`);--> statement-breakpoint
CREATE INDEX `request_assignments_assignee_idx` ON `requestAssignments` (`assigneeUserId`);--> statement-breakpoint
CREATE INDEX `request_attachments_request_idx` ON `requestAttachments` (`subjectRequestId`);--> statement-breakpoint
CREATE INDEX `request_decisions_request_idx` ON `requestDecisions` (`subjectRequestId`);--> statement-breakpoint
CREATE INDEX `request_history_request_idx` ON `requestHistory` (`subjectRequestId`);--> statement-breakpoint
CREATE INDEX `request_snapshots_request_idx` ON `requestSnapshots` (`subjectRequestId`);--> statement-breakpoint
CREATE INDEX `specialties_board_idx` ON `specialties` (`boardId`);--> statement-breakpoint
CREATE INDEX `subject_requests_board_status_idx` ON `subjectRequests` (`boardId`,`lifecycleStatus`,`workStatus`);--> statement-breakpoint
CREATE INDEX `subject_requests_requester_idx` ON `subjectRequests` (`requesterUserId`);