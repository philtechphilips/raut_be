import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserRequestHistory } from './models/request-history.model';
import { AppendRequestHistoryDto } from './dto/append-request-history.dto';
import { paginate } from '../../db/pagination.utils';

const MAX_ENTRIES = 500;

@Injectable()
export class RequestHistoryService {
  constructor(
    @InjectRepository(UserRequestHistory)
    private readonly repo: Repository<UserRequestHistory>,
  ) {}

  async listEntries(
    userId: string,
    take: number = 100,
    skip: number = 0,
  ): Promise<Record<string, unknown>[]> {
    const paginated = await paginate(
      this.repo,
      {
        where: { userId },
        order: { at: 'DESC' },
      },
      { limit: take, offset: skip },
    );

    return paginated.data.map((r) => ({
      ...r.payload,
      id: r.id,
      at: Number(r.at),
    }));
  }

  async append(userId: string, dto: AppendRequestHistoryDto): Promise<void> {
    const payload = { ...dto } as unknown as Record<string, unknown>;
    await this.repo.save({
      id: dto.id,
      userId,
      at: dto.at,
      payload,
    });
    await this.trimToLimit(userId);
  }

  async clear(userId: string): Promise<void> {
    await this.repo.delete({ userId });
  }

  private async trimToLimit(userId: string): Promise<void> {
    const total = await this.repo.count({ where: { userId } });
    if (total <= MAX_ENTRIES) return;
    const toRemove = total - MAX_ENTRIES;
    const oldest = await this.repo.find({
      where: { userId },
      order: { at: 'ASC' },
      take: toRemove,
      select: ['id'],
    });
    if (oldest.length === 0) return;
    await this.repo.delete({ id: In(oldest.map((r) => r.id)) });
  }
}
