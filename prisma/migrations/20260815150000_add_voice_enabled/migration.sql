-- Per-user live voice replies preference (Profile → Voice).
ALTER TABLE "UserProfile" ADD COLUMN "voiceEnabled" BOOLEAN NOT NULL DEFAULT true;