import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class AiService {
  private client: OpenAI | null = null;

  constructor() {
    const key = process.env.OPENAI_API_KEY;
    if (key) {
      this.client = new OpenAI({ apiKey: key });
    }
  }

  private requireClient(): OpenAI {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'AI is not configured on the server (missing OPENAI_API_KEY).',
      );
    }
    return this.client;
  }

  async enrichEndpoint(dto: {
    method: string;
    path: string;
    handlerSource: string;
  }): Promise<Record<string, unknown>> {
    const openai = this.requireClient();
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            "You are an expert backend engineer. Analyze the provided code and identify API parameters, body samples, and ALL possible response scenarios. \n\nIMPORTANT: Do NOT use ANY emojis in your response. Keep the tone professional and technical.\n\nReturn ONLY a JSON object with:\n- 'name': a human-readable title for this endpoint (e.g., 'User Registration' or 'Initiate Payment')\n- 'category': a high-level module/domain name (e.g., 'Authentication', 'Inventory', 'CRM')\n- 'body', 'query', 'params': arrays of {name, type, required, description}\n- 'bodySample': a JSON object example of the request body\n- 'responseScenarios': array of {status, description, data (JSON example)}\n- 'description': general string explaining the technical logic\n- 'response': summary string of the return value",
        },
        {
          role: 'user',
          content: `Endpoint: ${dto.method} ${dto.path}\n\nCode:\n${dto.handlerSource}`,
        },
      ],
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new ServiceUnavailableException('Empty AI response');
    }
    return JSON.parse(content) as Record<string, unknown>;
  }

  async analyzeProject(dto: {
    framework: string;
    endpointSummary: string;
    categoryNames?: string[];
  }): Promise<{
    name: string;
    description: string;
    folders: { name: string; description: string }[];
  }> {
    const openai = this.requireClient();
    const categoriesHint =
      dto.categoryNames?.length ?
        `\n\nFOLDER NAMES (use EXACTLY these strings as folders[].name — one overview per folder):\n${dto.categoryNames.map((n) => `- ${n}`).join('\n')}`
      : '';

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            "You are an expert technical writer. Analyze the provided list of API endpoints for a project and generate a professional 'Collection Name', a 'Project Overview', and a short overview for each logical folder/module.\n\nRULES:\n1. The name should be the proper product/service name inferred from paths (e.g. 'Stripe Payments', 'GitHub API'). If paths are generic, use a professional name based on logic.\n2. The overview (description) should summarize the core architecture and purpose of this API.\n3. If folder names are provided, return 'folders': an array of {name, description} where each 'name' matches one of those folder names exactly (same spelling/casing), and 'description' is 1–3 sentences on what that module covers (endpoints in that group only). Include every listed folder name once. If no folder names are provided, return folders as [].\n4. DO NOT USE EMOJIS.\n5. Keep it technical and high-density.\n\nReturn ONLY a JSON object with keys: 'name', 'description', 'folders' (array of {name, description}).",
        },
        {
          role: 'user',
          content: `Framework: ${dto.framework}\nEndpoints:\n${dto.endpointSummary}${categoriesHint}`,
        },
      ],
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { name: 'Rauts Collection', description: '', folders: [] };
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      return { name: 'Rauts Collection', description: '', folders: [] };
    }
    const name = typeof parsed.name === 'string' ? parsed.name : 'Rauts Collection';
    const description = typeof parsed.description === 'string' ? parsed.description : '';
    const foldersRaw = parsed.folders;
    const folders: { name: string; description: string }[] = [];
    if (Array.isArray(foldersRaw)) {
      for (const item of foldersRaw) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const fn = typeof o.name === 'string' ? o.name.trim() : '';
        const fd = typeof o.description === 'string' ? o.description.trim() : '';
        if (fn) folders.push({ name: fn, description: fd });
      }
    }
    if (dto.categoryNames?.length) {
      const allow = new Set(dto.categoryNames.map((n) => n.trim().toLowerCase()));
      const filtered = folders.filter((f) => allow.has(f.name.trim().toLowerCase()));
      return { name, description, folders: filtered };
    }
    return { name, description, folders };
  }
}
