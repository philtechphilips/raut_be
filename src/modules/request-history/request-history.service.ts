import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserRequestHistory } from './models/request-history.model';
import { AppendRequestHistoryDto } from './dto/append-request-history.dto';

const MAX_ENTRIES = 100;

@Injectable()
export class RequestHistoryService {
  constructor(
    @InjectRepository(UserRequestHistory)
    private readonly repo: Repository<UserRequestHistory>,
  ) {}

  async listEntries(userId: string): Promise<Record<string, unknown>[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { at: 'DESC' },
      take: MAX_ENTRIES,
    });
    return rows.map((r) => ({
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
