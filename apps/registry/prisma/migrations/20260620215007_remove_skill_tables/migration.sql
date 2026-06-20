/*
  Warnings:

  - You are about to drop the `skill_versions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `skills` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "skill_versions" DROP CONSTRAINT "skill_versions_skill_id_fkey";

-- DropTable
DROP TABLE "skill_versions";

-- DropTable
DROP TABLE "skills";
