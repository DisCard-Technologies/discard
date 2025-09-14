-- CreateEnum
CREATE TYPE "public"."Product" AS ENUM ('discard', 'textpay', 'both');

-- CreateTable
CREATE TABLE "public"."waitlist" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "company" VARCHAR(255),
    "product" "public"."Product" NOT NULL,
    "use_case" TEXT,
    "agree_to_updates" BOOLEAN NOT NULL DEFAULT false,
    "ip_address" INET,
    "user_agent" TEXT,
    "referrer" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email_sent" BOOLEAN NOT NULL DEFAULT false,
    "email_sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_email_key" ON "public"."waitlist"("email");

-- CreateIndex
CREATE INDEX "idx_waitlist_email" ON "public"."waitlist"("email");

-- CreateIndex
CREATE INDEX "idx_waitlist_product" ON "public"."waitlist"("product");

-- CreateIndex
CREATE INDEX "idx_waitlist_created_at" ON "public"."waitlist"("created_at");
