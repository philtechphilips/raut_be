import { Injectable } from '@nestjs/common';

export interface LocalRequest {
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface LocalResponse {
  status: number;
  statusText: string;
  headers: Array<{ key: string; value: string }>;
  bodyText: string;
}

@Injectable()
export class LocalRequestService {
  // Map of userId -> pending LocalRequests
  private pendingRequests = new Map<string, LocalRequest[]>();

  // Map of requestId -> resolver function
  private resolvers = new Map<string, (res: LocalResponse) => void>();

  addRequest(userId: string, req: Omit<LocalRequest, 'requestId'>): Promise<LocalResponse> {
    const requestId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    const fullReq: LocalRequest = { ...req, requestId };

    // Add to user's pending requests queue
    const list = this.pendingRequests.get(userId) || [];
    list.push(fullReq);
    this.pendingRequests.set(userId, list);

    return new Promise<LocalResponse>((resolve, reject) => {
      // Store the resolver
      this.resolvers.set(requestId, resolve);

      // Set a 15-second timeout for local agent response
      setTimeout(() => {
        if (this.resolvers.delete(requestId)) {
          // Remove from the pending queue if still present
          const currentList = this.pendingRequests.get(userId) || [];
          this.pendingRequests.set(
            userId,
            currentList.filter((r) => r.requestId !== requestId),
          );
          reject(new Error('Local proxy timeout. Please verify that the `rauts local` CLI command is active on your machine.'));
        }
      }, 15000);
    });
  }

  getPendingRequests(userId: string): LocalRequest[] {
    const list = this.pendingRequests.get(userId) || [];
    // Clear list after retrieval to prevent double fetches
    this.pendingRequests.set(userId, []);
    return list;
  }

  resolveRequest(requestId: string, response: LocalResponse): boolean {
    const resolve = this.resolvers.get(requestId);
    if (resolve) {
      this.resolvers.delete(requestId);
      resolve(response);
      return true;
    }
    return false;
  }
}
