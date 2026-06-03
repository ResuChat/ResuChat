import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import app from '../src/index';
import { inMemoryTokens } from '../src/auth/token';
import { getDatabase } from '../src/storage/database';
import {
  ensureUser,
  createConversation,
  storeMessage,
  setConversationDocs,
  setConversationChunks,
  setConversationChunksWithTypes,
  getConversationChunksWithTypes,
  appendConversationChunks,
  deleteChunksByRefId,
  isConversationOwner,
  getUserByPhone,
  getUserConversations,
  getConversationMessages,
  getConversationDocuments,
  deleteConversation,
  restoreConversation,
  setInitialPrompt,
  getInitialPrompt,
} from '../src/storage/repository';
import {
  addFileToConversation,
  getConversationDocsByType,
} from '../src/storage/file-manager';

let server: http.Server;
let testToken: string;
let testPhone = '13800138000';
let testUserId: number;
let testConversationId: string;

function request(options: {
  path: string;
  body?: object;
  token?: string;
  method?: 'GET' | 'POST' | 'DELETE' | 'PUT';
  headers?: Record<string, string>;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = options.body ? JSON.stringify(options.body) : '';
    const reqOptions = {
      hostname: 'localhost',
      port: 3000,
      path: options.path,
      method: options.method || (options.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(options.token ? { Token: options.token } : {}),
        ...options.headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk.toString();
      });
      res.on('end', () => resolve({ status: res?.statusCode ?? 0, body }));
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

beforeAll(async () => {
  testToken = 'test_token_' + Date.now();
  return new Promise<void>((resolve) => {
    server = app.listen(3000, async () => {
      inMemoryTokens[testToken] = {
        username: `user_${testPhone}`,
        expires: Date.now() + 86400000,
      };
      testUserId = await ensureUser(testPhone);
      testConversationId = `conv_test_${Date.now()}`;
      await createConversation(testConversationId, testUserId);
      await storeMessage(testConversationId, 'user', '请分析这份简历');
      await storeMessage(testConversationId, 'assistant', '好的，我来分析...');
      resolve();
    });
  });
});

afterAll(() => {
  return new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
});

beforeEach(() => {
  inMemoryTokens[testToken] = {
    username: `user_${testPhone}`,
    expires: Date.now() + 86400000,
  };
});

describe('Root API', () => {
  it('should return welcome message', async () => {
    const { status, body } = await request({ path: '/' });
    expect(status).toBe(200);
    expect(body).toContain('AI Agent BFF Layer Running');
  });
});

describe('Auth API', () => {
  it('should return 400 when login params missing', async () => {
    const { status } = await request({ path: '/auth/login', body: {} });
    expect(status).toBe(400);
  });

  it('should return 200 when logout', async () => {
    const { status } = await request({
      path: '/auth/logout',
      method: 'POST',
      token: testToken,
    });
    expect(status).toBe(200);
  });
});

describe('Captcha API', () => {
  it('should return 400 when phone missing', async () => {
    const { status } = await request({ path: '/captcha/generate', body: {} });
    expect(status).toBe(400);
  });
});

describe('RAG API', () => {
  it('should return 401 when token missing for search', async () => {
    const { status } = await request({
      path: '/rag/search',
      body: { query: 'test' },
    });
    expect(status).toBe(401);
  });

  it('should return 401 when token missing for start', async () => {
    const { status } = await request({ path: '/rag/start', body: {} });
    expect(status).toBe(401);
  });

  it('should return 401 when token missing for apply-modification', async () => {
    const { status } = await request({
      path: '/rag/apply-modification',
      body: {},
    });
    expect(status).toBe(401);
});

});

describe('Chunk Classification', () => {
  it('should classify resume chunks correctly using doc_type column', async () => {
    const convId = `conv_chunk_resume_${Date.now()}`;
    await createConversation(convId, testUserId);

    await setConversationChunksWithTypes(convId, [
      {
        pageContent: 'Resume chunk 1 content',
        metadata: { source: 'resume.pdf' },
        docType: 'resume',
      },
      {
        pageContent: 'Resume chunk 2 content',
        metadata: { source: 'resume.pdf' },
        docType: 'resume',
      },
    ]);

    const typedChunks = await getConversationChunksWithTypes(convId);
    expect(typedChunks.length).toBe(2);
    expect(typedChunks[0].docType).toBe('resume');
    expect(typedChunks[1].docType).toBe('resume');
  });

  it('should classify reference chunks correctly using doc_type column', async () => {
    const convId = `conv_chunk_ref_${Date.now()}`;
    await createConversation(convId, testUserId);

    await setConversationChunksWithTypes(convId, [
      {
        pageContent: 'Reference chunk 1',
        metadata: { source: 'job_desc.pdf' },
        docType: 'reference',
      },
      {
        pageContent: 'Reference chunk 2',
        metadata: { source: 'job_desc.pdf' },
        docType: 'reference',
      },
    ]);

    const typedChunks = await getConversationChunksWithTypes(convId);
    expect(typedChunks.length).toBe(2);
    expect(typedChunks[0].docType).toBe('reference');
    expect(typedChunks[1].docType).toBe('reference');
  });

  it('should handle mixed resume and reference chunks', async () => {
    const convId = `conv_chunk_mixed_${Date.now()}`;
    await createConversation(convId, testUserId);

    await setConversationChunksWithTypes(convId, [
      {
        pageContent: 'Resume content',
        metadata: { source: 'my_resume.pdf' },
        docType: 'resume',
      },
      {
        pageContent: 'Reference content',
        metadata: { source: 'reference.pdf' },
        docType: 'reference',
      },
    ]);

    const typedChunks = await getConversationChunksWithTypes(convId);
    expect(typedChunks.length).toBe(2);
    expect(typedChunks[0].docType).toBe('resume');
    expect(typedChunks[1].docType).toBe('reference');
  });

  it('should default to resume for chunks without doc_type', async () => {
    const convId = `conv_chunk_orphan_${Date.now()}`;
    await createConversation(convId, testUserId);

    const db = getDatabase();
    db.prepare(
      'INSERT INTO chunks (conversation_id, page_content, metadata, source, chunk_index, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      convId,
      'Orphan chunk content',
      JSON.stringify({ source: 'unknown.pdf' }),
      'unknown.pdf',
      0,
      Date.now(),
    );

    const typedChunks = await getConversationChunksWithTypes(convId);
    expect(typedChunks.length).toBe(1);
    expect(typedChunks[0].docType).toBe('resume');
  });

  it('should return empty array for conversation with no chunks', async () => {
    const convId = `conv_chunk_empty_${Date.now()}`;
    await createConversation(convId, testUserId);

    const typedChunks = await getConversationChunksWithTypes(convId);
    expect(typedChunks.length).toBe(0);
  });

  it('should exclude deleted chunks from results', async () => {
    const convId = `conv_chunk_deleted_${Date.now()}`;
    await createConversation(convId, testUserId);

    await setConversationChunksWithTypes(
      convId,
      [
        {
          pageContent: 'Resume content',
          metadata: { source: 'resume.pdf' },
          docType: 'resume',
        },
        {
          pageContent: 'Reference content',
          metadata: { source: 'ref.pdf' },
          docType: 'reference',
        },
      ],
      1,
    );

    await deleteChunksByRefId(convId, 1);

    const typedChunks = await getConversationChunksWithTypes(convId);
    expect(typedChunks.length).toBe(0);
  });

  it('should delete chunks by ref_id precisely', async () => {
    const convId = `conv_chunk_refid_${Date.now()}`;
    await createConversation(convId, testUserId);

    await setConversationChunksWithTypes(
      convId,
      [
        {
          pageContent: 'Resume content',
          metadata: { source: 'resume.pdf' },
          docType: 'resume',
        },
      ],
      10,
    );

    await appendConversationChunks(
      convId,
      [
        {
          pageContent: 'Job A reference',
          metadata: { source: 'job_a.pdf' },
          docType: 'reference',
        },
      ],
      11,
    );

    await appendConversationChunks(
      convId,
      [
        {
          pageContent: 'Job B reference',
          metadata: { source: 'job_b.pdf' },
          docType: 'reference',
        },
      ],
      12,
    );

    const beforeDelete = await getConversationChunksWithTypes(convId);
    expect(beforeDelete.length).toBe(3);

    await deleteChunksByRefId(convId, 11);

    const afterDelete = await getConversationChunksWithTypes(convId);
    expect(afterDelete.length).toBe(2);
    expect(afterDelete[0].pageContent).toBe('Resume content');
    expect(afterDelete[1].pageContent).toBe('Job B reference');
  });

  it('should store ref_id on chunks for precise file tracking', async () => {
    const convId = `conv_chunk_refid_store_${Date.now()}`;
    await createConversation(convId, testUserId);

    await setConversationChunksWithTypes(
      convId,
      [
        {
          pageContent: 'Resume chunk',
          metadata: { source: 'resume.pdf' },
          docType: 'resume',
        },
      ],
      42,
    );

    const db = getDatabase();
    const row = db
      .prepare(
        'SELECT ref_id FROM chunks WHERE conversation_id = ? AND page_content = ?',
      )
      .get(convId, 'Resume chunk') as { ref_id: number | null };

    expect(row.ref_id).toBe(42);
  });
});

describe('Initial Prompt', () => {
  it('should create conversation with initial_prompt', async () => {
    const convId = `conv_initial_${Date.now()}`;
    const prompt = '请分析这份简历';
    await createConversation(convId, testUserId, prompt);

    const db = getDatabase();
    const row = db
      .prepare('SELECT initial_prompt FROM conversations WHERE id = ?')
      .get(convId) as { initial_prompt: string | null };

    expect(row.initial_prompt).toBe(prompt);
  });

  it('should set initial_prompt correctly', async () => {
    const convId = `conv_setprompt_${Date.now()}`;
    await createConversation(convId, testUserId);
    const prompt = '帮我优化简历';

    await setInitialPrompt(convId, prompt);

    const db = getDatabase();
    const row = db
      .prepare('SELECT initial_prompt FROM conversations WHERE id = ?')
      .get(convId) as { initial_prompt: string | null };

    expect(row.initial_prompt).toBe(prompt);
  });

  it('should return initial_prompt in messages response', async () => {
    const convId = `conv_msg_prompt_${Date.now()}`;
    const prompt = '请分析这份简历';
    await createConversation(convId, testUserId, prompt);
    await storeMessage(convId, 'user', prompt);
    await storeMessage(convId, 'assistant', '好的，我来分析...');

    const result = await getConversationMessages(convId, 1, 10);
    expect(result.initialPrompt).toBe(prompt);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('should return null initial_prompt when not set', async () => {
    const convId = `conv_no_prompt_${Date.now()}`;
    await createConversation(convId, testUserId); // 不传 initial_prompt

    const result = await getConversationMessages(convId, 1, 10);
    expect(result.initialPrompt).toBeNull();
  });
});

describe('Reasoning Persistence', () => {
  it('should store and return reasoning for assistant messages', async () => {
    const convId = `conv_reasoning_${Date.now()}`;
    await createConversation(convId, testUserId);
    const reasoningText = '第一步：分析简历结构...第二步：提取关键技能...';
    await storeMessage(convId, 'user', '请分析简历');
    await storeMessage(convId, 'assistant', '分析结果...', reasoningText);

    const result = await getConversationMessages(convId, 1, 10);
    const assistantMsg = result.data.find((m) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.reasoning).toBe(reasoningText);
  });

  it('should have empty reasoning by default', async () => {
    const convId = `conv_no_reasoning_${Date.now()}`;
    await createConversation(convId, testUserId);
    await storeMessage(convId, 'user', '请分析');
    await storeMessage(convId, 'assistant', '好的');

    const result = await getConversationMessages(convId, 1, 10);
    const msgs = result.data;
    msgs.forEach((m) => {
      expect(m).toHaveProperty('reasoning');
    });
  });

  it('should have empty reasoning for user messages', async () => {
    const convId = `conv_user_reasoning_${Date.now()}`;
    await createConversation(convId, testUserId);
    await storeMessage(convId, 'user', '你好');
    await storeMessage(convId, 'assistant', '你好！', '助理推理');

    const result = await getConversationMessages(convId, 1, 10);
    const userMsg = result.data.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg!.reasoning).toBe('');
  });
});
