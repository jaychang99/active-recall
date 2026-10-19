-- Runs on first container start. Local-development privileges only (shadow DB for prisma migrate + test DB).
CREATE DATABASE IF NOT EXISTS recall_studio_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON *.* TO 'recall'@'%';
FLUSH PRIVILEGES;
