ALTER TABLE `Deck` ADD COLUMN `lastStudiedAt` DATETIME(3) NULL;
ALTER TABLE `Subject` ADD COLUMN `lastStudiedAt` DATETIME(3) NULL;

-- Backfill from history: deck-scoped study sessions and exam attempts open a deck,
-- subject-scoped sessions ("subject:<name>") open a subject. Browse was never recorded.
UPDATE `Deck` d
  JOIN (SELECT `deckId`, MAX(`startedAt`) AS m FROM `StudySession` WHERE `deckId` IS NOT NULL AND `deletedAt` IS NULL GROUP BY `deckId`) s ON s.`deckId` = d.`id`
  SET d.`lastStudiedAt` = s.m;
UPDATE `Deck` d
  JOIN (SELECT `deckId`, MAX(`startedAt`) AS m FROM `ExamAttempt` WHERE `deletedAt` IS NULL GROUP BY `deckId`) e ON e.`deckId` = d.`id`
  SET d.`lastStudiedAt` = GREATEST(COALESCE(d.`lastStudiedAt`, e.m), e.m);
UPDATE `Subject` sub
  JOIN (SELECT `userId`, SUBSTRING(`scope`, 9) AS name, MAX(`startedAt`) AS m FROM `StudySession` WHERE `scope` LIKE 'subject:%' AND `deletedAt` IS NULL GROUP BY `userId`, SUBSTRING(`scope`, 9)) s ON s.`userId` = sub.`userId` AND s.name = sub.`name`
  SET sub.`lastStudiedAt` = s.m;
