/*
  Warnings:

  - Added the required column `bigImg` to the `Stream` table without a default value. This is not possible if the table is not empty.
  - Added the required column `smallImg` to the `Stream` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Stream` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Stream" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "extractedId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "smallImg" TEXT NOT NULL,
    "bigImg" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Stream_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Stream" ("active", "extractedId", "id", "type", "url", "userId") SELECT "active", "extractedId", "id", "type", "url", "userId" FROM "Stream";
DROP TABLE "Stream";
ALTER TABLE "new_Stream" RENAME TO "Stream";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
