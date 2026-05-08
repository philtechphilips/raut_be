import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Stores one dashboard “Send” row per user; `id` is client-generated (UUID). */
@Entity({ name: 'user_request_history' })
@Index(['userId', 'at'])
export class UserRequestHistory {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  /** Epoch ms from the client when the request finished (for ordering). */
  @Column({ type: 'bigint', unsigned: true })
  at: number;

  /** Full entry shape expected by the dashboard (validated in service). */
  @Column({ type: 'json' })
  payload: Record<string, unknown>;
}
