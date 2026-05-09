import { Repository, FindManyOptions, ObjectLiteral } from 'typeorm';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface PaginationParams {
  limit?: string | number;
  offset?: string | number;
}

/**
 * Reusable database pagination utility for TypeORM repositories.
 * Accepts any TypeORM Entity Repository, standard query FindManyOptions,
 * and string/integer limit-offset pairs.
 */
export async function paginate<T extends ObjectLiteral>(
  repository: Repository<T>,
  options: FindManyOptions<T>,
  params: PaginationParams,
  defaultLimit = 100,
): Promise<PaginatedResult<T>> {
  const limit = params.limit !== undefined && params.limit !== null
    ? parseInt(String(params.limit), 10)
    : defaultLimit;

  const offset = params.offset !== undefined && params.offset !== null
    ? parseInt(String(params.offset), 10)
    : 0;

  const [data, total] = await repository.findAndCount({
    ...options,
    take: limit,
    skip: offset,
  });

  return {
    data,
    total,
    limit,
    offset,
  };
}
