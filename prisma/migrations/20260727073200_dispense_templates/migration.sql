-- CreateTable
CREATE TABLE "dispense_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispense_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispense_template_lines" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "dispense_template_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dispense_template_lines_templateId_idx" ON "dispense_template_lines"("templateId");

-- AddForeignKey
ALTER TABLE "dispense_templates" ADD CONSTRAINT "dispense_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispense_template_lines" ADD CONSTRAINT "dispense_template_lines_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "dispense_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispense_template_lines" ADD CONSTRAINT "dispense_template_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
