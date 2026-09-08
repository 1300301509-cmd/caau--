import type { Prisma } from '@caau/database';
import type { RequirementsDto } from '../materials/materials.dto.js';
export async function initializeExecution(
  tx: Prisma.TransactionClient,
  taskId: string,
  configuration: RequirementsDto,
) {
  const deadlines = {
    task: configuration.deadline,
    materials: configuration.materials.map((m) => ({
      id: m.id,
      deadline: m.deadline,
    })),
  };
  await tx.taskExecution.create({
    data: { taskId, deadlines, draft: { create: {} } },
  });
}
