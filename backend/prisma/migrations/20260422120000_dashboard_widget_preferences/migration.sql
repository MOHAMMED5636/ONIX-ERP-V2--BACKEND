-- CreateTable
CREATE TABLE "dashboard_widget_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_widget_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_widget_preferences_userId_key" ON "dashboard_widget_preferences"("userId");

-- AddForeignKey
ALTER TABLE "dashboard_widget_preferences" ADD CONSTRAINT "dashboard_widget_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

