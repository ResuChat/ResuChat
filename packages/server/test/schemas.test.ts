import { describe, it, expect } from 'vitest';
import { TodoSchema, UserSchema, MessageSchema } from '../src/lib/schemas';

describe('TodoSchema', () => {
  it('should accept valid todo', () => {
    const result = TodoSchema.parse({ title: '完成任务', completed: false });
    expect(result.title).toBe('完成任务');
  });

  it('should reject todo missing title', () => {
    expect(() => TodoSchema.parse({ completed: true })).toThrow();
  });
});

describe('UserSchema', () => {
  it('should accept valid user', () => {
    const user = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: '张三',
      email: 'zhangsan@example.com',
      role: 'admin' as const,
    };
    const result = UserSchema.parse(user);
    expect(result.name).toBe('张三');
  });

  it('should accept user with optional age', () => {
    const user = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: '李四',
      email: 'lisi@example.com',
      role: 'user' as const,
      age: 25,
    };
    const result = UserSchema.parse(user);
    expect(result.age).toBe(25);
  });

  it('should reject invalid email', () => {
    expect(() =>
      UserSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: '王五',
        email: 'not-an-email',
        role: 'guest',
      }),
    ).toThrow();
  });

  it('should reject invalid role', () => {
    expect(() =>
      UserSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440003',
        name: '赵六',
        email: 'zhao@example.com',
        role: 'superadmin',
      }),
    ).toThrow();
  });
});

describe('MessageSchema', () => {
  it('should accept valid message', () => {
    const msg = {
      id: '550e8400-e29b-41d4-a716-446655440010',
      content: '你好',
      senderId: '550e8400-e29b-41d4-a716-446655440011',
      receiverId: '550e8400-e29b-41d4-a716-446655440012',
      timestamp: '2024-01-01T00:00:00Z',
    };
    const result = MessageSchema.parse(msg);
    expect(result.content).toBe('你好');
  });

  it('should reject empty content', () => {
    expect(() =>
      MessageSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440013',
        content: '',
        senderId: '550e8400-e29b-41d4-a716-446655440014',
        receiverId: '550e8400-e29b-41d4-a716-446655440015',
        timestamp: '2024-01-01T00:00:00Z',
      }),
    ).toThrow();
  });

  it('should reject content exceeding 1000 chars', () => {
    expect(() =>
      MessageSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440016',
        content: 'a'.repeat(1001),
        senderId: '550e8400-e29b-41d4-a716-446655440017',
        receiverId: '550e8400-e29b-41d4-a716-446655440018',
        timestamp: '2024-01-01T00:00:00Z',
      }),
    ).toThrow();
  });
});
