import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { addDays, mondayCleanupExpiresAt, weekStartKst } from "../_shared/dates.ts";
import { PHOTO_SIGNED_URL_TTL_SECONDS } from "../_shared/env.ts";

Deno.test("KST week starts Monday and expires next Monday 00:00 KST", () => {
  assertEquals(weekStartKst("2026-06-08"), "2026-06-08");
  assertEquals(weekStartKst("2026-06-14"), "2026-06-08");
  assertEquals(addDays("2026-06-08", 7), "2026-06-15");
  assertEquals(mondayCleanupExpiresAt("2026-06-08"), "2026-06-14T15:00:00.000Z");
});

Deno.test("dashboard photo signed URL TTL is one day", () => {
  assertEquals(PHOTO_SIGNED_URL_TTL_SECONDS, 86400);
});
