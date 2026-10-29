-- Database-level integrity rules. These complement the application-level validation
-- so that invalid academic/financial data can never be stored, even by a buggy client.

ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_dates_chk" CHECK ("end_date" > "start_date");
ALTER TABLE "examinations"   ADD CONSTRAINT "examinations_dates_chk"   CHECK ("end_date" >= "start_date");

ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_max_marks_chk"     CHECK ("max_marks" > 0);
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_passing_marks_chk" CHECK ("passing_marks" >= 0 AND "passing_marks" <= "max_marks");

ALTER TABLE "marks" ADD CONSTRAINT "marks_non_negative_chk" CHECK ("marks_obtained" IS NULL OR "marks_obtained" >= 0);
ALTER TABLE "marks" ADD CONSTRAINT "marks_absent_chk"       CHECK (NOT ("is_absent" AND "marks_obtained" IS NOT NULL));

ALTER TABLE "assignments" ADD CONSTRAINT "assignments_max_marks_chk" CHECK ("max_marks" > 0);
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "submissions_marks_chk" CHECK ("marks" IS NULL OR "marks" >= 0);

ALTER TABLE "fees" ADD CONSTRAINT "fees_amount_chk"   CHECK ("amount" >= 0);
ALTER TABLE "fees" ADD CONSTRAINT "fees_discount_chk" CHECK ("discount" >= 0 AND "discount" <= "amount");
ALTER TABLE "fees" ADD CONSTRAINT "fees_paid_chk"     CHECK ("amount_paid" >= 0 AND "amount_paid" <= "amount" - "discount");
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_amount_chk" CHECK ("amount" > 0);
ALTER TABLE "fee_categories" ADD CONSTRAINT "fee_categories_amount_chk" CHECK ("default_amount" IS NULL OR "default_amount" >= 0);

ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_roll_chk" CHECK ("roll_number" > 0);
ALTER TABLE "timetables"  ADD CONSTRAINT "timetables_day_chk"   CHECK ("day_of_week" BETWEEN 1 AND 7);
ALTER TABLE "periods"     ADD CONSTRAINT "periods_time_chk"     CHECK ("end_time" > "start_time");
ALTER TABLE "sections"    ADD CONSTRAINT "sections_capacity_chk" CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "grade_scales" ADD CONSTRAINT "grade_scales_pct_chk" CHECK ("min_percent" >= 0 AND "min_percent" <= 100);
ALTER TABLE "notices" ADD CONSTRAINT "notices_expiry_chk" CHECK ("expiry_date" IS NULL OR "expiry_date" > "publish_date");
ALTER TABLE "notices" ADD CONSTRAINT "notices_audience_chk" CHECK (
  ("audience" = 'CLASS'   AND "class_id" IS NOT NULL) OR
  ("audience" = 'SECTION' AND "section_id" IS NOT NULL) OR
  ("audience" NOT IN ('CLASS', 'SECTION'))
);

-- Only one current academic year per school.
CREATE UNIQUE INDEX "academic_years_one_current_idx" ON "academic_years" ("school_id") WHERE "is_current";

-- Case-insensitive uniqueness for login emails.
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" (LOWER("email")) WHERE "email" IS NOT NULL;

-- Fast case-insensitive search on names.
CREATE INDEX "users_name_search_idx" ON "users" (LOWER("first_name"), LOWER("last_name"));
