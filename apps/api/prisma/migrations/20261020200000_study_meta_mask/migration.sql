-- AlterTable
ALTER TABLE `AppSettings` ADD COLUMN `hideDifficulty` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `hideTags` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `hideSubject` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `hideSource` BOOLEAN NOT NULL DEFAULT false;
