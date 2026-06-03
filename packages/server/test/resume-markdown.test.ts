import { describe, it, expect } from 'vitest';
import { modifySection, replaceText, extractSectionContent } from '../src/lib/resume-markdown';

describe('modifySection', () => {
  it('should replace content under a heading matched by name', () => {
    const input = '# 项目经验\n\n做了些事情\n\n# 教育背景\n\n某某大学\n';
    const result = modifySection(input, '项目经验', '做了新事情');
    expect(result).toContain('# 项目经验');
    expect(result).toContain('做了新事情');
    expect(result).toContain('教育背景');
    expect(result).not.toContain('做了些事情');
  });

  it('should replace content under a heading matched by headingId', () => {
    const input = '# 标题1\n\n内容A\n\n# 标题2\n\n内容B\n';
    const result = modifySection(input, '标题2', '新内容', '#2');
    expect(result).toContain('新内容');
    expect(result).not.toContain('内容B');
  });

  it('should return original text when heading not found', () => {
    const input = '# 项目经验\n\n内容\n';
    const result = modifySection(input, '不存在的标题', '新内容');
    expect(result).toBe(input);
  });

  it('should replace heading itself when targetType is heading', () => {
    const input = '# 旧标题\n\n内容\n';
    const result = modifySection(input, '旧标题', '新标题', '#1', 'heading');
    expect(result).toContain('新标题');
  });
});

describe('replaceText', () => {
  const fullText = '我叫张三，是一名前端工程师。\n我擅长 Vue 和 React。\n';

  it('should replace exact match', () => {
    const result = replaceText(fullText, '前端工程师', '全栈工程师');
    expect(result).toContain('全栈工程师');
    expect(result).not.toContain('前端工程师');
  });

  it('should replace flat match (newlines in text)', () => {
    const text = 'hello\nworld\nfoo';
    const result = replaceText(text, 'hello world', 'hi there');
    expect(result).toContain('hi there');
    expect(result).not.toContain('hello\nworld');
  });

  it('should replace normalized match (collapsed whitespace)', () => {
    const text = '我叫张三。\n我擅长  Vue  和  React。\n';
    const result = replaceText(text, '我擅长 Vue 和 React。', '我熟悉 Angular。');
    expect(result).toContain('我熟悉 Angular');
    expect(result).not.toContain('Vue');
  });

  it('should return original text when current not found', () => {
    const result = replaceText(fullText, '完全不存在的文本', '新内容');
    expect(result).toBe(fullText);
  });
});

describe('extractSectionContent', () => {
  it('should extract content under a heading', () => {
    const input = '# 技能\n\nVue\nReact\n\n# 项目\n\n项目A\n';
    const result = extractSectionContent(input, '技能');
    expect(result).toContain('Vue');
    expect(result).toContain('React');
    expect(result).not.toContain('项目A');
  });

  it('should return empty string when heading not found', () => {
    const input = '# 技能\n\nVue\n';
    expect(extractSectionContent(input, '不存在的')).toBe('');
  });
});
