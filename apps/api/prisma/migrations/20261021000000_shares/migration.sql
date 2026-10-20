-- AlterTable
ALTER TABLE `Deck` ADD COLUMN `originId` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `Question` ADD COLUMN `originId` VARCHAR(64) NULL;

-- CreateTable
CREATE TABLE `Share` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `recipientEmail` VARCHAR(320) NOT NULL,
    `recipientId` VARCHAR(191) NULL,
    `kind` ENUM('deck', 'subject', 'questions') NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `message` TEXT NULL,
    `snapshotJson` JSON NOT NULL,
    `deckCount` INTEGER NOT NULL,
    `questionCount` INTEGER NOT NULL,
    `status` ENUM('pending', 'accepted', 'declined', 'canceled') NOT NULL DEFAULT 'pending',
    `expiresAt` DATETIME(3) NOT NULL,
    `respondedAt` DATETIME(3) NULL,
    `resultJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Share_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `Share_recipientEmail_status_idx`(`recipientEmail`, `status`),
    INDEX `Share_recipientId_idx`(`recipientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Deck_userId_originId_idx` ON `Deck`(`userId`, `originId`);

-- AddForeignKey
ALTER TABLE `Share` ADD CONSTRAINT `Share_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Share` ADD CONSTRAINT `Share_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

