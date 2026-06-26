-- AddForeignKey
ALTER TABLE "project_characters" ADD CONSTRAINT "project_characters_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
