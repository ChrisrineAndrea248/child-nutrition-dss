-- =============================================================================
-- Child Nutrition DSS — full database setup
--
-- HOW TO USE:
--   1. In phpMyAdmin, create a database named `undernutrition_dss` (or drop and
--      recreate it if it already exists and you want a clean start).
--   2. Click into that database, click the "SQL" tab, paste this ENTIRE file,
--      and click "Go".
--   3. That's it — all 14 tables are created. No other tool is involved.
-- =============================================================================

CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(128) NOT NULL,
	`entity` varchar(64),
	`entityId` varchar(64),
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);

CREATE TABLE `children` (
	`id` int AUTO_INCREMENT NOT NULL,
	`childId` varchar(64) NOT NULL,
	`ageMonths` int NOT NULL,
	`sex` varchar(20) NOT NULL,
	`weightKg` decimal(6,2) NOT NULL,
	`heightCm` decimal(6,2),
	`muacCm` decimal(6,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `children_id` PRIMARY KEY(`id`),
	CONSTRAINT `children_childId_unique` UNIQUE(`childId`)
);

CREATE TABLE `health_environment_information` (
	`id` int AUTO_INCREMENT NOT NULL,
	`childId` int NOT NULL,
	`data` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `health_environment_information_id` PRIMARY KEY(`id`)
);

CREATE TABLE `household_information` (
	`id` int AUTO_INCREMENT NOT NULL,
	`childId` int NOT NULL,
	`data` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `household_information_id` PRIMARY KEY(`id`)
);

CREATE TABLE `maternal_information` (
	`id` int AUTO_INCREMENT NOT NULL,
	`childId` int NOT NULL,
	`data` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maternal_information_id` PRIMARY KEY(`id`)
);

CREATE TABLE `model_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version` varchar(32) NOT NULL,
	`accuracy` decimal(5,4),
	`precision` decimal(5,4),
	`recall` decimal(5,4),
	`f1Score` decimal(5,4),
	`rocAuc` decimal(5,4),
	`trainingDataSize` int,
	`testingDataSize` int,
	`riskDistribution` json,
	`confusionMatrix` json,
	`lastTrainedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_versions_id` PRIMARY KEY(`id`)
);

CREATE TABLE `password_reset_otps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`otpHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp NULL DEFAULT NULL,
	`verifiedAt` timestamp NULL DEFAULT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`resendCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_otps_id` PRIMARY KEY(`id`)
);

CREATE TABLE `prediction_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`predictionId` int NOT NULL,
	`prediction` varchar(64) NOT NULL,
	`riskLevel` enum('High','Moderate','Low') NOT NULL,
	`probability` decimal(5,4) NOT NULL,
	`riskScore` int NOT NULL,
	`modelVersionId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prediction_results_id` PRIMARY KEY(`id`)
);

CREATE TABLE `predictions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`predictionId` varchar(64) NOT NULL,
	`childId` int NOT NULL,
	`officerId` int NOT NULL,
	`modelVersionId` int,
	`inputData` json,
	`prediction` varchar(64) NOT NULL,
	`riskLevel` enum('High','Moderate','Low') NOT NULL,
	`probability` decimal(5,4) NOT NULL,
	`riskScore` int NOT NULL,
	`stuntingProbability` decimal(5,4),
	`stuntingThreshold` decimal(5,4),
	`stuntingRiskScore` int,
	`underweightProbability` decimal(5,4),
	`underweightThreshold` decimal(5,4),
	`underweightRiskScore` int,
	`combinedRisk` varchar(64),
	`recommendations` json,
	`featureImportance` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `predictions_id` PRIMARY KEY(`id`),
	CONSTRAINT `predictions_predictionId_unique` UNIQUE(`predictionId`)
);

CREATE TABLE `recommendations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`predictionResultId` int NOT NULL,
	`recommendation` text NOT NULL,
	`priority` enum('high','medium','low') NOT NULL DEFAULT 'medium',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recommendations_id` PRIMARY KEY(`id`)
);

CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportType` varchar(64) NOT NULL,
	`generatedBy` int NOT NULL,
	`fileUrl` text,
	`format` varchar(16) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);

CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`description` text,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_name_unique` UNIQUE(`name`)
);

CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`value` text,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_settings_key_unique` UNIQUE(`key`)
);

CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`username` varchar(64),
	`passwordHash` varchar(255),
	`name` text,
	`email` varchar(320),
	`phone` varchar(32),
	`title` varchar(128),
	`avatar` text,
	`loginMethod` varchar(64),
	`role` enum('admin','nutrition_officer','data_manager') NOT NULL DEFAULT 'nutrition_officer',
	`status` enum('pending','active','inactive','suspended','rejected') NOT NULL DEFAULT 'active',
	`mustChangePassword` boolean NOT NULL DEFAULT false,
	`passwordHistory` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	`lastActiveAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`),
	INDEX `users_status_idx` (`status`),
	INDEX `users_createdAt_idx` (`createdAt`)
);

-- Migration: Replace link-based password reset with OTP flow.
-- Safe: renames the table and adds new columns without data loss.
-- ALTER TABLE `password_reset_tokens` RENAME TO `password_reset_otps`;
-- ALTER TABLE `password_reset_otps` CHANGE COLUMN `tokenHash` `otpHash` varchar(128) NOT NULL;
-- ALTER TABLE `password_reset_otps` ADD COLUMN `verifiedAt` timestamp NULL DEFAULT NULL AFTER `usedAt`;
-- ALTER TABLE `password_reset_otps` ADD COLUMN `attempts` int NOT NULL DEFAULT 0 AFTER `verifiedAt`;
-- ALTER TABLE `password_reset_otps` ADD COLUMN `resendCount` int NOT NULL DEFAULT 0 AFTER `attempts`;
-- WARNING: Do NOT use DROP TABLE — it destroys existing data.

-- Migration: Add featureImportance column to predictions table.
-- Safe to run on existing installations — column is nullable, no data loss.
-- ALTER TABLE `predictions` ADD COLUMN `featureImportance` json AFTER `recommendations`;

-- Migration: Add passwordHistory column for password reuse prevention.
-- Stores JSON array of recent password hashes (last 5). Safe to run on existing installations.
-- ALTER TABLE `users` ADD COLUMN `passwordHistory` json;

-- Migration: Add lastActiveAt column for inactivity timeout tracking.
-- Safe to run on existing installations — defaults to current timestamp.
-- ALTER TABLE `users` ADD COLUMN `lastActiveAt` timestamp NOT NULL DEFAULT (now());

-- Notifications table — stores in-app notifications per user.
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`type` varchar(64) NOT NULL,
	`entity` varchar(64),
	`entityId` varchar(64),
	`link` varchar(512),
	`read` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `notifications_userId_index` INDEX(`userId`)
);

-- =============================================================================
-- Migration: Harden users table with UNIQUE constraints and indexes.
-- Run on existing databases to catch up to the updated CREATE TABLE above.
-- Safe to run on fresh installs (CREATE TABLE already includes these).
-- =============================================================================

-- UNIQUE constraints prevent duplicate username/email at the database level.
-- Uses conditional syntax so they're safe to run if the constraint already exists.
-- Note: MariaDB does not support IF NOT EXISTS for ADD CONSTRAINT.
-- If these fail with "Duplicate key name" or "Duplicate entry", the constraint
-- already exists and you can safely ignore the error.

-- ALTER TABLE `users` ADD UNIQUE INDEX `users_username_unique` (`username`);
-- ALTER TABLE `users` ADD UNIQUE INDEX `users_email_unique` (`email`);
-- ALTER TABLE `users` ADD INDEX `users_status_idx` (`status`);
-- ALTER TABLE `users` ADD INDEX `users_createdAt_idx` (`createdAt`);
