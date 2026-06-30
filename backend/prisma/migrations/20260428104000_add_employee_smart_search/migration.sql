-- Add searchable profile fields to users
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "search_index" TEXT,
  ADD COLUMN IF NOT EXISTS "keywords" JSONB,
  ADD COLUMN IF NOT EXISTS "skills" JSONB,
  ADD COLUMN IF NOT EXISTS "availability_status" TEXT DEFAULT 'AVAILABLE';

-- Ensure pg_trgm extension exists for fast ILIKE/trigram matches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Fast lookup on aggregated search field
CREATE INDEX IF NOT EXISTS "users_search_index_trgm_idx"
  ON "users" USING GIN ("search_index" gin_trgm_ops);

-- Keep users.search_index synchronized on inserts/updates
CREATE OR REPLACE FUNCTION onix_update_users_search_index()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  first_name_val TEXT := COALESCE(NEW."firstName", '');
  last_name_val TEXT := COALESCE(NEW."lastName", '');
  email_val TEXT := COALESCE(NEW."email", '');
  phone_val TEXT := COALESCE(NEW."phone", '');
  department_val TEXT := COALESCE(NEW."department", '');
  position_val TEXT := COALESCE(NEW."position", '');
  job_title_val TEXT := COALESCE(NEW."jobTitle", '');
  company_val TEXT := COALESCE(NEW."company", '');
  company_location_val TEXT := COALESCE(NEW."companyLocation", '');
  skills_text TEXT := '';
  keywords_text TEXT := '';
BEGIN
  IF NEW."skills" IS NOT NULL THEN
    SELECT string_agg(value, ' ')
    INTO skills_text
    FROM jsonb_array_elements_text(NEW."skills");
  END IF;

  IF NEW."keywords" IS NOT NULL THEN
    SELECT string_agg(value, ' ')
    INTO keywords_text
    FROM jsonb_array_elements_text(NEW."keywords");
  END IF;

  NEW."search_index" := trim(regexp_replace(concat_ws(' ',
    first_name_val,
    last_name_val,
    email_val,
    phone_val,
    department_val,
    position_val,
    job_title_val,
    company_val,
    company_location_val,
    COALESCE(skills_text, ''),
    COALESCE(keywords_text, '')
  ), '\s+', ' ', 'g'));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS onix_users_search_index_trigger ON "users";

CREATE TRIGGER onix_users_search_index_trigger
BEFORE INSERT OR UPDATE OF
  "firstName", "lastName", "email", "phone", "department", "position", "jobTitle",
  "company", "companyLocation", "skills", "keywords"
ON "users"
FOR EACH ROW
EXECUTE FUNCTION onix_update_users_search_index();

-- Backfill existing rows
UPDATE "users"
SET "search_index" = trim(regexp_replace(concat_ws(' ',
  COALESCE("firstName", ''),
  COALESCE("lastName", ''),
  COALESCE("email", ''),
  COALESCE("phone", ''),
  COALESCE("department", ''),
  COALESCE("position", ''),
  COALESCE("jobTitle", ''),
  COALESCE("company", ''),
  COALESCE("companyLocation", ''),
  COALESCE((SELECT string_agg(value, ' ') FROM jsonb_array_elements_text("skills")), ''),
  COALESCE((SELECT string_agg(value, ' ') FROM jsonb_array_elements_text("keywords")), '')
), '\s+', ' ', 'g'))
WHERE "search_index" IS NULL OR "search_index" = '';
