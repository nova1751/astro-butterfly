import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config', () => ({ site: { timezone: 'Asia/Shanghai', url: 'https://example.com' } }));

const { slugize, HexoSlugger } = await import('../../src/lib/slug');
const { fromHexoDate, formatDateTime } = await import('../../src/lib/date');
const { countWords, formatCount } = await import('../../src/lib/wordcount');

describe('hexo slug compatibility', () => {
  it('matches hexo-util slugize', () => {
    expect(slugize('Front End')).toBe('Front-End');
    expect(slugize('模块的导入与 K 均值聚类算法类的定义')).toBe('模块的导入与-K-均值聚类算法类的定义');
    expect(slugize('k-means 算法的实现步骤：')).toBe('k-means-算法的实现步骤：');
    expect(slugize('  a.b/c  ')).toBe('a-b-c');
  });

  it('slugs escaped HTML and de-duplicates like Hexo', () => {
    const s = new HexoSlugger();
    expect(s.slug('Java Number&Math 类')).toBe('Java-Number-amp-Math-类');
    expect(s.slug('基础')).toBe('基础');
    expect(s.slug('基础')).toBe('基础-1');
    expect(s.slug('基础')).toBe('基础-2');
  });
});

describe('dates', () => {
  it('reads YAML-parsed Hexo dates as Asia/Shanghai local time', () => {
    // js-yaml turns `2024-01-02 23:34:30` into 2024-01-02T23:34:30Z
    const d = fromHexoDate(new Date('2024-01-02T23:34:30Z'))!;
    expect(d.toISOString()).toBe('2024-01-02T15:34:30.000Z');
    expect(formatDateTime(d)).toBe('2024-01-02 23:34:30');
    expect(fromHexoDate('2024-01-02 23:34:30')!.toISOString()).toBe('2024-01-02T15:34:30.000Z');
    expect(fromHexoDate('')).toBeUndefined();
  });
});

describe('word count', () => {
  it('counts CJK characters and latin words', () => {
    expect(countWords('你好世界 hello world').words).toBe(6);
    expect(countWords('a'.repeat(5)).minutes).toBe(1);
    expect(formatCount(950)).toBe('950');
    expect(formatCount(3123)).toBe('3.1k');
  });
});
