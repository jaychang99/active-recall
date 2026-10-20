-- DropForeignKey
ALTER TABLE `ExamAttempt` DROP FOREIGN KEY `ExamAttempt_deckId_fkey`;

-- DropForeignKey
ALTER TABLE `Question` DROP FOREIGN KEY `Question_deckId_fkey`;

-- DropForeignKey
ALTER TABLE `StudySession` DROP FOREIGN KEY `StudySession_deckId_fkey`;

-- DropIndex
DROP INDEX `CardState_dueAt_status_idx` ON `CardState`;

-- DropIndex
DROP INDEX `CardState_flagged_idx` ON `CardState`;

-- DropIndex
DROP INDEX `CardState_status_idx` ON `CardState`;

-- DropIndex
DROP INDEX `Deck_subject_idx` ON `Deck`;

-- DropIndex
DROP INDEX `ExamAttempt_startedAt_idx` ON `ExamAttempt`;

-- DropIndex
DROP INDEX `PracticeLog_createdAt_idx` ON `PracticeLog`;

-- DropIndex
DROP INDEX `ReviewLog_idempotencyKey_key` ON `ReviewLog`;

-- DropIndex
DROP INDEX `ReviewLog_reviewedAt_idx` ON `ReviewLog`;

-- DropIndex
DROP INDEX `StudySession_startedAt_idx` ON `StudySession`;

-- DropIndex
DROP INDEX `Subject_name_key` ON `Subject`;

-- AlterTable (AppSettings: the singleton id=1 row becomes one row per user with a cuid id).
-- Recreated instead of altered: TiDB cannot DROP PRIMARY KEY on a clustered table, and this migration only
-- ever runs on empty databases (existing single-user data moves through backup → restore).
DROP TABLE `AppSettings`;
CREATE TABLE `AppSettings` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `newCardsPerDay` INTEGER NOT NULL DEFAULT 20,
    `reviewsPerDay` INTEGER NOT NULL DEFAULT 200,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Seoul',
    `shortcutsEnabled` BOOLEAN NOT NULL DEFAULT true,
    `showIntervalPreview` BOOLEAN NOT NULL DEFAULT true,
    `autoAdvanceAfterRating` BOOLEAN NOT NULL DEFAULT true,
    `requestRetention` DOUBLE NOT NULL DEFAULT 0.9,
    `maximumInterval` INTEGER NOT NULL DEFAULT 36500,
    `enableFuzz` BOOLEAN NOT NULL DEFAULT false,
    `shuffleChoices` BOOLEAN NOT NULL DEFAULT true,
    `newCardOrder` VARCHAR(16) NOT NULL DEFAULT 'deck',
    `dailyReviewGoal` INTEGER NOT NULL DEFAULT 50,
    `leechThreshold` INTEGER NOT NULL DEFAULT 8,
    `promptDefaults` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `CardState` ADD COLUMN `userId` VARCHAR(191) NOT NULL;

-- AlterTable (Deck: the external slug stops being the primary key; the id becomes a cuid). Recreated for
-- the same TiDB reason as AppSettings; the referencing foreign keys were dropped at the top of this file.
DROP TABLE `Deck`;
CREATE TABLE `Deck` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `subject` VARCHAR(200) NOT NULL,
    `language` VARCHAR(35) NOT NULL,
    `tagsJson` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Deck_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `ExamAttempt` ADD COLUMN `userId` VARCHAR(191) NOT NULL,
    MODIFY `deckId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `ExamResponse` ADD COLUMN `userId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `PracticeLog` ADD COLUMN `userId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Question` ADD COLUMN `userId` VARCHAR(191) NOT NULL,
    MODIFY `deckId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `QuestionNote` ADD COLUMN `userId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `QuestionSubject` ADD COLUMN `userId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `ReviewLog` ADD COLUMN `userId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `StudySession` ADD COLUMN `userId` VARCHAR(191) NOT NULL,
    MODIFY `deckId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Subject` ADD COLUMN `userId` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(16) NOT NULL,
    `providerSub` VARCHAR(191) NOT NULL,
    `email` VARCHAR(320) NOT NULL,
    `name` VARCHAR(200) NULL,
    `image` VARCHAR(2048) NULL,
    `lastSeenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `User_email_idx`(`email`),
    INDEX `User_deletedAt_idx`(`deletedAt`),
    UNIQUE INDEX `User_provider_providerSub_key`(`provider`, `providerSub`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `AppSettings_userId_key` ON `AppSettings`(`userId`);

-- CreateIndex
CREATE INDEX `CardState_userId_dueAt_status_idx` ON `CardState`(`userId`, `dueAt`, `status`);

-- CreateIndex
CREATE INDEX `CardState_userId_status_idx` ON `CardState`(`userId`, `status`);

-- CreateIndex
CREATE INDEX `CardState_userId_flagged_idx` ON `CardState`(`userId`, `flagged`);

-- CreateIndex
CREATE INDEX `Deck_userId_subject_idx` ON `Deck`(`userId`, `subject`);

-- CreateIndex
CREATE UNIQUE INDEX `Deck_userId_slug_key` ON `Deck`(`userId`, `slug`);

-- CreateIndex
CREATE INDEX `ExamAttempt_userId_startedAt_idx` ON `ExamAttempt`(`userId`, `startedAt`);

-- CreateIndex
CREATE INDEX `ExamResponse_userId_idx` ON `ExamResponse`(`userId`);

-- CreateIndex
CREATE INDEX `PracticeLog_userId_createdAt_idx` ON `PracticeLog`(`userId`, `createdAt`);

-- CreateIndex
CREATE INDEX `Question_userId_idx` ON `Question`(`userId`);

-- CreateIndex
CREATE INDEX `QuestionNote_userId_idx` ON `QuestionNote`(`userId`);

-- CreateIndex
CREATE INDEX `QuestionSubject_userId_idx` ON `QuestionSubject`(`userId`);

-- CreateIndex
CREATE INDEX `ReviewLog_userId_reviewedAt_idx` ON `ReviewLog`(`userId`, `reviewedAt`);

-- CreateIndex
CREATE UNIQUE INDEX `ReviewLog_userId_idempotencyKey_key` ON `ReviewLog`(`userId`, `idempotencyKey`);

-- CreateIndex
CREATE INDEX `StudySession_userId_startedAt_idx` ON `StudySession`(`userId`, `startedAt`);

-- CreateIndex
CREATE UNIQUE INDEX `Subject_userId_name_key` ON `Subject`(`userId`, `name`);

-- AddForeignKey
ALTER TABLE `Deck` ADD CONSTRAINT `Deck_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Question` ADD CONSTRAINT `Question_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Question` ADD CONSTRAINT `Question_deckId_fkey` FOREIGN KEY (`deckId`) REFERENCES `Deck`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subject` ADD CONSTRAINT `Subject_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionSubject` ADD CONSTRAINT `QuestionSubject_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardState` ADD CONSTRAINT `CardState_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewLog` ADD CONSTRAINT `ReviewLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionNote` ADD CONSTRAINT `QuestionNote_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudySession` ADD CONSTRAINT `StudySession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudySession` ADD CONSTRAINT `StudySession_deckId_fkey` FOREIGN KEY (`deckId`) REFERENCES `Deck`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PracticeLog` ADD CONSTRAINT `PracticeLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExamAttempt` ADD CONSTRAINT `ExamAttempt_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExamAttempt` ADD CONSTRAINT `ExamAttempt_deckId_fkey` FOREIGN KEY (`deckId`) REFERENCES `Deck`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExamResponse` ADD CONSTRAINT `ExamResponse_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AppSettings` ADD CONSTRAINT `AppSettings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

