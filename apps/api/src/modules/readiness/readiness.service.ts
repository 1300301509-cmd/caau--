import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { DatabaseProbe } from '@caau/database';

export const DATABASE_PROBE = Symbol('DATABASE_PROBE');
export const READINESS_TIMEOUT_MS = 1500;

@Injectable()
export class DatabaseReadinessService implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_PROBE) private readonly probe: DatabaseProbe) {}

  async isReady(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve()
          .then(() => this.probe.check())
          .catch(() => false),
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), READINESS_TIMEOUT_MS);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async onApplicationShutdown() {
    await this.probe.close();
  }
}
