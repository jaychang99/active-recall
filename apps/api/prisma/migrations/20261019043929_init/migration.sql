-- CreateTable
CREATE TABLE `Deck` (
    `id` VARCHAR(80) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `subject` VARCHAR(200) NOT NULL,
    `language` VARCHAR(35) NOT NULL,
    `tagsJson` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Deck_subject_idx`(`subject`),
    INDEX `Deck_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Question` (
    `id` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(80) NOT NULL,
    `deckId` VARCHAR(80) NOT NULL,
    `type` ENUM('single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay', 'cloze', 'ordering', 'matching') NOT NULL,
    `payloadJson` JSON NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `answerHash` CHAR(64) NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `sortIndex` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Question_deckId_type_idx`(`deckId`, `type`),
    INDEX `Question_deckId_sortIndex_idx`(`deckId`, `sortIndex`),
    INDEX `Question_deletedAt_idx`(`deletedAt`),
    UNIQUE INDEX `Question_deckId_externalId_key`(`deckId`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CardState` (
    `questionId` VARCHAR(191) NOT NULL,
    `stateJson` JSON NOT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `status` ENUM('NEW', 'LEARNING', 'REVIEW', 'RELEARNING') NOT NULL DEFAULT 'NEW',
    `stability` DOUBLE NOT NULL DEFAULT 0,
    `difficulty` DOUBLE NOT NULL DEFAULT 0,
    `reps` INTEGER NOT NULL DEFAULT 0,
    `lapses` INTEGER NOT NULL DEFAULT 0,
    `lastReviewAt` DATETIME(3) NULL,
    `suspended` BOOLEAN NOT NULL DEFAULT false,
    `flagged` BOOLEAN NOT NULL DEFAULT false,
    `buriedUntil` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `CardState_dueAt_status_idx`(`dueAt`, `status`),
    INDEX `CardState_status_idx`(`status`),
    INDEX `CardState_flagged_idx`(`flagged`),
    PRIMARY KEY (`questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReviewLog` (
    `id` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NULL,
    `idempotencyKey` VARCHAR(120) NOT NULL,
    `rating` INTEGER NOT NULL,
    `previousStatus` ENUM('NEW', 'LEARNING', 'REVIEW', 'RELEARNING') NOT NULL DEFAULT 'NEW',
    `reviewRound` INTEGER NOT NULL,
    `reviewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `elapsedMs` INTEGER NOT NULL DEFAULT 0,
    `isCorrect` BOOLEAN NULL,
    `revealedBeforeAnswer` BOOLEAN NOT NULL DEFAULT false,
    `hintUsed` BOOLEAN NOT NULL DEFAULT false,
    `answerPayloadJson` JSON NULL,
    `previousCardStateJson` JSON NOT NULL,
    `resultingCardStateJson` JSON NOT NULL,
    `fsrsLogJson` JSON NOT NULL,
    `schedulerVersion` VARCHAR(40) NOT NULL,
    `undone` BOOLEAN NOT NULL DEFAULT false,
    `undoneAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ReviewLog_idempotencyKey_key`(`idempotencyKey`),
    INDEX `ReviewLog_questionId_reviewedAt_idx`(`questionId`, `reviewedAt`),
    INDEX `ReviewLog_reviewedAt_idx`(`reviewedAt`),
    INDEX `ReviewLog_sessionId_idx`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionNote` (
    `id` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `reviewRound` INTEGER NOT NULL,
    `reviewLogId` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `QuestionNote_questionId_updatedAt_idx`(`questionId`, `updatedAt`),
    UNIQUE INDEX `QuestionNote_questionId_reviewRound_key`(`questionId`, `reviewRound`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudySession` (
    `id` VARCHAR(191) NOT NULL,
    `deckId` VARCHAR(80) NULL,
    `scope` VARCHAR(120) NOT NULL DEFAULT 'deck',
    `mode` ENUM('study', 'cram', 'practice', 'exam') NOT NULL DEFAULT 'study',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `queueSize` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `StudySession_deckId_startedAt_idx`(`deckId`, `startedAt`),
    INDEX `StudySession_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PracticeLog` (
    `id` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NULL,
    `isCorrect` BOOLEAN NULL,
    `answerPayloadJson` JSON NULL,
    `elapsedMs` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `PracticeLog_questionId_createdAt_idx`(`questionId`, `createdAt`),
    INDEX `PracticeLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExamAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `deckId` VARCHAR(80) NOT NULL,
    `title` VARCHAR(200) NOT NULL DEFAULT '',
    `configJson` JSON NOT NULL,
    `questionIds` JSON NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `submittedAt` DATETIME(3) NULL,
    `scoreJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `ExamAttempt_deckId_startedAt_idx`(`deckId`, `startedAt`),
    INDEX `ExamAttempt_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExamResponse` (
    `id` VARCHAR(191) NOT NULL,
    `attemptId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `answerPayloadJson` JSON NULL,
    `isCorrect` BOOLEAN NULL,
    `gradeDetailJson` JSON NULL,
    `selfScore` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ExamResponse_attemptId_questionId_key`(`attemptId`, `questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppSettings` (
    `id` INTEGER NOT NULL DEFAULT 1,
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
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Question` ADD CONSTRAINT `Question_deckId_fkey` FOREIGN KEY (`deckId`) REFERENCES `Deck`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardState` ADD CONSTRAINT `CardState_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewLog` ADD CONSTRAINT `ReviewLog_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewLog` ADD CONSTRAINT `ReviewLog_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `StudySession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionNote` ADD CONSTRAINT `QuestionNote_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionNote` ADD CONSTRAINT `QuestionNote_reviewLogId_fkey` FOREIGN KEY (`reviewLogId`) REFERENCES `ReviewLog`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudySession` ADD CONSTRAINT `StudySession_deckId_fkey` FOREIGN KEY (`deckId`) REFERENCES `Deck`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PracticeLog` ADD CONSTRAINT `PracticeLog_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PracticeLog` ADD CONSTRAINT `PracticeLog_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `StudySession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExamAttempt` ADD CONSTRAINT `ExamAttempt_deckId_fkey` FOREIGN KEY (`deckId`) REFERENCES `Deck`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExamResponse` ADD CONSTRAINT `ExamResponse_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `ExamAttempt`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExamResponse` ADD CONSTRAINT `ExamResponse_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
