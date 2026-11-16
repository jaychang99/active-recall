-- AlterTable (one change per statement for TiDB)
ALTER TABLE `StudySession` ADD COLUMN `lastActiveAt` DATETIME(3) NULL;
ALTER TABLE `StudySession` ADD COLUMN `lastPosition` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `StudySession` ADD COLUMN `paramsKey` VARCHAR(64) NULL;
ALTER TABLE `StudySession` MODIFY `mode` ENUM('study', 'cram', 'practice', 'exam', 'browse') NOT NULL DEFAULT 'study';

-- CreateTable
CREATE TABLE `StudySessionItem` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `reviewRound` INTEGER NOT NULL,
    `skipped` BOOLEAN NOT NULL DEFAULT false,
    `phase` VARCHAR(16) NULL,
    `answerPayloadJson` JSON NULL,
    `revealedBeforeAnswer` BOOLEAN NOT NULL DEFAULT false,
    `hintUsed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `StudySessionItem_userId_idx`(`userId`),
    UNIQUE INDEX `StudySessionItem_sessionId_position_key`(`sessionId`, `position`),
    UNIQUE INDEX `StudySessionItem_sessionId_questionId_reviewRound_key`(`sessionId`, `questionId`, `reviewRound`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `StudySession_userId_paramsKey_lastActiveAt_idx` ON `StudySession`(`userId`, `paramsKey`, `lastActiveAt`);

-- AddForeignKey
ALTER TABLE `StudySessionItem` ADD CONSTRAINT `StudySessionItem_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudySessionItem` ADD CONSTRAINT `StudySessionItem_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `StudySession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudySessionItem` ADD CONSTRAINT `StudySessionItem_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

