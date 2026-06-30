-- CreateTable
CREATE TABLE "servers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "servers_name_key" ON "servers"("name");

-- CreateTable (junction)
CREATE TABLE "_AllowlistEntryToServer" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_AllowlistEntryToServer_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_AllowlistEntryToServer_B_index" ON "_AllowlistEntryToServer"("B");

-- AddForeignKey
ALTER TABLE "_AllowlistEntryToServer" ADD CONSTRAINT "_AllowlistEntryToServer_A_fkey" FOREIGN KEY ("A") REFERENCES "allowlist_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AllowlistEntryToServer" ADD CONSTRAINT "_AllowlistEntryToServer_B_fkey" FOREIGN KEY ("B") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
