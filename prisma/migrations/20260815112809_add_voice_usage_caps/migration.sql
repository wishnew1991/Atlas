-- Add daily voice usage cap to VoiceConfig
ALTER TABLE "VoiceConfig" ADD COLUMN "dailyVoiceLimitMinutes" INTEGER NOT NULL DEFAULT 15;

-- Per-user daily voice usage tracker
CREATE TABLE "VoiceUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "VoiceUsage_userId_day_key" ON "VoiceUsage"("userId", "day");
CREATE INDEX "VoiceUsage_userId_idx" ON "VoiceUsage"("userId");
