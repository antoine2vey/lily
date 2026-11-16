-- Rewrites tzdata aliases in users.timezone and canopies.timezone to the zones
-- they name, so day math never depends on the tzdata build a runtime ships.
-- The rows come from `bun run --filter=@lily/db generate:time-zones -- --sql`.
-- 0072, 0074, 0080, 0081 and 0083 ran when Postgres knew no alias and computed
-- the day columns of an alias's plants in UTC, so they are recomputed here
-- first. A zone outside the map is left as it is.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TEMPORARY TABLE "time_zone_aliases" (
  "alias" text PRIMARY KEY,
  "zone" text NOT NULL
) ON COMMIT DROP;
--> statement-breakpoint
INSERT INTO "time_zone_aliases" ("alias", "zone") VALUES
  ('Africa/Asmera', 'Africa/Nairobi'),
  ('Africa/Timbuktu', 'Africa/Abidjan'),
  ('America/Argentina/ComodRivadavia', 'America/Argentina/Catamarca'),
  ('America/Atka', 'America/Adak'),
  ('America/Buenos_Aires', 'America/Argentina/Buenos_Aires'),
  ('America/Catamarca', 'America/Argentina/Catamarca'),
  ('America/Coral_Harbour', 'America/Panama'),
  ('America/Cordoba', 'America/Argentina/Cordoba'),
  ('America/Ensenada', 'America/Tijuana'),
  ('America/Fort_Wayne', 'America/Indiana/Indianapolis'),
  ('America/Godthab', 'America/Nuuk'),
  ('America/Indianapolis', 'America/Indiana/Indianapolis'),
  ('America/Jujuy', 'America/Argentina/Jujuy'),
  ('America/Knox_IN', 'America/Indiana/Knox'),
  ('America/Louisville', 'America/Kentucky/Louisville'),
  ('America/Mendoza', 'America/Argentina/Mendoza'),
  ('America/Montreal', 'America/Toronto'),
  ('America/Nipigon', 'America/Toronto'),
  ('America/Pangnirtung', 'America/Iqaluit'),
  ('America/Porto_Acre', 'America/Rio_Branco'),
  ('America/Rainy_River', 'America/Winnipeg'),
  ('America/Rosario', 'America/Argentina/Cordoba'),
  ('America/Santa_Isabel', 'America/Tijuana'),
  ('America/Shiprock', 'America/Denver'),
  ('America/Thunder_Bay', 'America/Toronto'),
  ('America/Virgin', 'America/Puerto_Rico'),
  ('America/Yellowknife', 'America/Edmonton'),
  ('Antarctica/South_Pole', 'Pacific/Auckland'),
  ('Asia/Ashkhabad', 'Asia/Ashgabat'),
  ('Asia/Calcutta', 'Asia/Kolkata'),
  ('Asia/Choibalsan', 'Asia/Ulaanbaatar'),
  ('Asia/Chongqing', 'Asia/Shanghai'),
  ('Asia/Chungking', 'Asia/Shanghai'),
  ('Asia/Dacca', 'Asia/Dhaka'),
  ('Asia/Harbin', 'Asia/Shanghai'),
  ('Asia/Istanbul', 'Europe/Istanbul'),
  ('Asia/Kashgar', 'Asia/Urumqi'),
  ('Asia/Katmandu', 'Asia/Kathmandu'),
  ('Asia/Macao', 'Asia/Macau'),
  ('Asia/Rangoon', 'Asia/Yangon'),
  ('Asia/Saigon', 'Asia/Ho_Chi_Minh'),
  ('Asia/Tel_Aviv', 'Asia/Jerusalem'),
  ('Asia/Thimbu', 'Asia/Thimphu'),
  ('Asia/Ujung_Pandang', 'Asia/Makassar'),
  ('Asia/Ulan_Bator', 'Asia/Ulaanbaatar'),
  ('Atlantic/Faeroe', 'Atlantic/Faroe'),
  ('Atlantic/Jan_Mayen', 'Europe/Berlin'),
  ('Australia/ACT', 'Australia/Sydney'),
  ('Australia/Canberra', 'Australia/Sydney'),
  ('Australia/Currie', 'Australia/Hobart'),
  ('Australia/LHI', 'Australia/Lord_Howe'),
  ('Australia/NSW', 'Australia/Sydney'),
  ('Australia/North', 'Australia/Darwin'),
  ('Australia/Queensland', 'Australia/Brisbane'),
  ('Australia/South', 'Australia/Adelaide'),
  ('Australia/Tasmania', 'Australia/Hobart'),
  ('Australia/Victoria', 'Australia/Melbourne'),
  ('Australia/West', 'Australia/Perth'),
  ('Australia/Yancowinna', 'Australia/Broken_Hill'),
  ('Brazil/Acre', 'America/Rio_Branco'),
  ('Brazil/DeNoronha', 'America/Noronha'),
  ('Brazil/East', 'America/Sao_Paulo'),
  ('Brazil/West', 'America/Manaus'),
  ('CET', 'Europe/Brussels'),
  ('Canada/Atlantic', 'America/Halifax'),
  ('Canada/Central', 'America/Winnipeg'),
  ('Canada/Eastern', 'America/Toronto'),
  ('Canada/Mountain', 'America/Edmonton'),
  ('Canada/Newfoundland', 'America/St_Johns'),
  ('Canada/Pacific', 'America/Vancouver'),
  ('Canada/Saskatchewan', 'America/Regina'),
  ('Canada/Yukon', 'America/Whitehorse'),
  ('Chile/Continental', 'America/Santiago'),
  ('Chile/EasterIsland', 'Pacific/Easter'),
  ('Cuba', 'America/Havana'),
  ('EET', 'Europe/Athens'),
  ('EST', 'America/Panama'),
  ('Egypt', 'Africa/Cairo'),
  ('Eire', 'Europe/Dublin'),
  ('Etc/GMT+0', 'Etc/GMT'),
  ('Etc/GMT-0', 'Etc/GMT'),
  ('Etc/GMT0', 'Etc/GMT'),
  ('Etc/Greenwich', 'Etc/GMT'),
  ('Etc/UCT', 'UTC'),
  ('Etc/UTC', 'UTC'),
  ('Etc/Universal', 'UTC'),
  ('Etc/Zulu', 'UTC'),
  ('Europe/Belfast', 'Europe/London'),
  ('Europe/Kiev', 'Europe/Kyiv'),
  ('Europe/Nicosia', 'Asia/Nicosia'),
  ('Europe/Tiraspol', 'Europe/Chisinau'),
  ('Europe/Uzhgorod', 'Europe/Kyiv'),
  ('Europe/Zaporozhye', 'Europe/Kyiv'),
  ('GB', 'Europe/London'),
  ('GB-Eire', 'Europe/London'),
  ('GMT', 'Etc/GMT'),
  ('GMT+0', 'Etc/GMT'),
  ('GMT-0', 'Etc/GMT'),
  ('GMT0', 'Etc/GMT'),
  ('Greenwich', 'Etc/GMT'),
  ('HST', 'Pacific/Honolulu'),
  ('Hongkong', 'Asia/Hong_Kong'),
  ('Iceland', 'Africa/Abidjan'),
  ('Iran', 'Asia/Tehran'),
  ('Israel', 'Asia/Jerusalem'),
  ('Jamaica', 'America/Jamaica'),
  ('Japan', 'Asia/Tokyo'),
  ('Kwajalein', 'Pacific/Kwajalein'),
  ('Libya', 'Africa/Tripoli'),
  ('MET', 'Europe/Brussels'),
  ('MST', 'America/Phoenix'),
  ('Mexico/BajaNorte', 'America/Tijuana'),
  ('Mexico/BajaSur', 'America/Mazatlan'),
  ('Mexico/General', 'America/Mexico_City'),
  ('NZ', 'Pacific/Auckland'),
  ('NZ-CHAT', 'Pacific/Chatham'),
  ('Navajo', 'America/Denver'),
  ('PRC', 'Asia/Shanghai'),
  ('Pacific/Enderbury', 'Pacific/Kanton'),
  ('Pacific/Johnston', 'Pacific/Honolulu'),
  ('Pacific/Ponape', 'Pacific/Guadalcanal'),
  ('Pacific/Samoa', 'Pacific/Pago_Pago'),
  ('Pacific/Truk', 'Pacific/Port_Moresby'),
  ('Pacific/Yap', 'Pacific/Port_Moresby'),
  ('Poland', 'Europe/Warsaw'),
  ('Portugal', 'Europe/Lisbon'),
  ('ROC', 'Asia/Taipei'),
  ('ROK', 'Asia/Seoul'),
  ('Singapore', 'Asia/Singapore'),
  ('Turkey', 'Europe/Istanbul'),
  ('UCT', 'UTC'),
  ('US/Alaska', 'America/Anchorage'),
  ('US/Aleutian', 'America/Adak'),
  ('US/Arizona', 'America/Phoenix'),
  ('US/Central', 'America/Chicago'),
  ('US/East-Indiana', 'America/Indiana/Indianapolis'),
  ('US/Eastern', 'America/New_York'),
  ('US/Hawaii', 'Pacific/Honolulu'),
  ('US/Indiana-Starke', 'America/Indiana/Knox'),
  ('US/Michigan', 'America/Detroit'),
  ('US/Mountain', 'America/Denver'),
  ('US/Pacific', 'America/Los_Angeles'),
  ('US/Samoa', 'Pacific/Pago_Pago'),
  ('Universal', 'UTC'),
  ('W-SU', 'Europe/Moscow'),
  ('WET', 'Europe/Lisbon'),
  ('Zulu', 'UTC');
--> statement-breakpoint
CREATE TEMPORARY TABLE "alias_plants" ON COMMIT DROP AS
SELECT p."id" AS "plant_id", a."zone"
FROM "plants" p
LEFT JOIN "canopies" c ON c."id" = p."canopy_id"
LEFT JOIN "users" u ON u."id" = p."user_id"
JOIN "time_zone_aliases" a ON a."alias" = coalesce(c."timezone", u."timezone");
--> statement-breakpoint
CREATE TEMPORARY TABLE "care_day_moves" ON COMMIT DROP AS
SELECT
  cl."id",
  cl."plant_id",
  cl."type",
  cl."care_day" AS "old_day",
  (cl."date" AT TIME ZONE ap."zone")::date AS "new_day",
  row_number() OVER (
    PARTITION BY cl."plant_id", cl."type", (cl."date" AT TIME ZONE ap."zone")::date
    ORDER BY cl."date", cl."created_at", cl."id"
  ) AS "rank"
FROM "care_logs" cl
JOIN "alias_plants" ap ON ap."plant_id" = cl."plant_id"
WHERE cl."care_day" <> (cl."date" AT TIME ZONE ap."zone")::date;
--> statement-breakpoint
-- A log keeps its day when its new day ends up held by a log that does not
-- move: one already on its right day, an earlier log landing on the same day,
-- or a log kept in place for either reason.
WITH RECURSIVE "kept" AS (
  SELECT m."id", m."plant_id", m."type", m."old_day"
  FROM "care_day_moves" m
  WHERE m."rank" > 1
    OR EXISTS (
      SELECT 1
      FROM "care_logs" held
      WHERE held."plant_id" = m."plant_id"
        AND held."type" = m."type"
        AND held."care_day" = m."new_day"
        AND NOT EXISTS (
          SELECT 1 FROM "care_day_moves" o WHERE o."id" = held."id"
        )
    )
  UNION
  SELECT m."id", m."plant_id", m."type", m."old_day"
  FROM "care_day_moves" m
  JOIN "kept" k
    ON k."plant_id" = m."plant_id"
    AND k."type" = m."type"
    AND k."old_day" = m."new_day"
)
DELETE FROM "care_day_moves" m
USING "kept" k
WHERE m."id" = k."id";
--> statement-breakpoint
-- Postgres checks a unique index row by row, so a run of consecutive days that
-- each move by one would collide midway through a single UPDATE.
DROP INDEX "care_logs_one_per_care_day";
--> statement-breakpoint
UPDATE "care_logs" cl
SET "care_day" = m."new_day"
FROM "care_day_moves" m
WHERE cl."id" = m."id";
--> statement-breakpoint
CREATE UNIQUE INDEX "care_logs_one_per_care_day"
  ON "care_logs" ("plant_id", "type", "care_day");
--> statement-breakpoint
UPDATE "plant_care_schedules" s
SET "due_day" = (s."next_care_at" AT TIME ZONE ap."zone")::date
FROM "alias_plants" ap
WHERE ap."plant_id" = s."plant_id"
  AND s."due_day" <> (s."next_care_at" AT TIME ZONE ap."zone")::date;
--> statement-breakpoint
UPDATE "users" u
SET "timezone" = a."zone"
FROM "time_zone_aliases" a
WHERE u."timezone" = a."alias";
--> statement-breakpoint
UPDATE "canopies" c
SET "timezone" = a."zone"
FROM "time_zone_aliases" a
WHERE c."timezone" = a."alias";
