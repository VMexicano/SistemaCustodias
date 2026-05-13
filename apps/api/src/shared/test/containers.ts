import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

export interface TestContainers {
  postgres: StartedPostgreSqlContainer;
  redis: StartedRedisContainer;
  postgresUrl: string;
  redisUrl: string;
  stop: () => Promise<void>;
}

export async function startTestContainers(): Promise<TestContainers> {
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer('timescale/timescaledb:latest-pg15')
      .withDatabase('ridebase_test')
      .withUsername('ridebase_test')
      .withPassword('ridebase_test')
      .start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);

  const postgresUrl = postgres.getConnectionUri();
  const redisUrl = `redis://${redis.getHost()}:${redis.getFirstMappedPort()}`;

  return {
    postgres,
    redis,
    postgresUrl,
    redisUrl,
    stop: async () => {
      await Promise.all([postgres.stop(), redis.stop()]);
    },
  };
}
