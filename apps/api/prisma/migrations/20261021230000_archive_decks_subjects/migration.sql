ALTER TABLE `Deck` ADD COLUMN `archivedAt` DATETIME(3) NULL;
ALTER TABLE `Subject` ADD COLUMN `archivedAt` DATETIME(3) NULL;
CREATE INDEX `Deck_userId_archivedAt_idx` ON `Deck`(`userId`, `archivedAt`);
CREATE INDEX `Subject_userId_archivedAt_idx` ON `Subject`(`userId`, `archivedAt`);
