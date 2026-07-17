import type { RawFiberNode } from './types';

// roadmap.md의 "컴포넌트 수백 개 넘어가도 안 뭉개지는 UX" 가정을 검증하기 위한 대규모 가짜 데이터 생성기.
// exp1이 뽑은 실제 구조(호스트/컴포지트 혼합, 익명 Provider Fiber 존재)를 15개 도메인 규모로 확장한다.
// 시드 고정 PRNG를 써서 새로고침해도 같은 트리가 나오게 한다(데모 재현성).

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DOMAINS = [
  'app-shell',
  'dashboard',
  'settings',
  'billing',
  'auth',
  'catalog',
  'cart',
  'checkout',
  'profile',
  'notifications',
  'search',
  'admin',
  'reports',
  'onboarding',
  'support',
];

const COMPONENT_WORDS = [
  'Panel',
  'Card',
  'List',
  'Row',
  'Header',
  'Footer',
  'Sidebar',
  'Modal',
  'Form',
  'Field',
  'Button',
  'Table',
  'Chart',
  'Badge',
  'Menu',
  'Item',
  'Toolbar',
  'Section',
  'Summary',
  'Widget',
];

const HOST_TAGS = ['div', 'span', 'section', 'ul', 'li', 'button', 'p'];

interface GenerateOptions {
  seed?: number;
  nodesPerDomain?: number;
  anonymousRate?: number;
  crossGroupRootRate?: number;
  /**
   * 스트레스 테스트용: DOMAINS 목록(15개)을 넘는 그룹 수를 요청하면 `domain-2`, `domain-3` ...
   * 형태로 이름을 늘려 생성한다 (roadmap.md "컴포넌트 수백~수천 개" 중 "수천"·"그룹 100개+" 검증).
   */
  domainCount?: number;
}

function buildDomainList(domainCount: number): string[] {
  if (domainCount <= DOMAINS.length) return DOMAINS.slice(0, domainCount);
  const extra: string[] = [...DOMAINS];
  let round = 2;
  while (extra.length < domainCount) {
    for (const base of DOMAINS) {
      if (extra.length >= domainCount) break;
      if (base === 'app-shell') continue; // app-shell은 유일한 루트 도메인으로 유지한다.
      extra.push(`${base}-${round}`);
    }
    round++;
  }
  return extra.slice(0, domainCount);
}

export function generateLargeTree(options: GenerateOptions = {}): RawFiberNode[] {
  const {
    seed = 42,
    nodesPerDomain = 24,
    anonymousRate = 0.07,
    crossGroupRootRate = 0.3,
    domainCount = DOMAINS.length,
  } = options;
  const rand = mulberry32(seed);
  const nodes: RawFiberNode[] = [];
  let nextId = 1;
  const domains = buildDomainList(domainCount);

  const domainRootIds: Record<string, number> = {};

  function pick<T>(arr: T[]): T {
    return arr[Math.floor(rand() * arr.length)];
  }

  function makeCompositeName(domain: string, idx: number): string {
    const prefix = domain
      .split('-')
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join('');
    return `${prefix}${pick(COMPONENT_WORDS)}${idx}`;
  }

  // 1) app-shell을 먼저 만들어 다른 도메인이 여기서 갈라져 나올 수 있게 한다.
  const shellRootId = nextId++;
  nodes.push({ id: shellRootId, displayName: 'AppShell', kind: 'composite', parentId: null, group: 'app-shell' });
  domainRootIds['app-shell'] = shellRootId;
  const shellLayoutId = nextId++;
  nodes.push({
    id: shellLayoutId,
    displayName: '(anonymous)',
    kind: 'composite',
    parentId: shellRootId,
    group: 'app-shell',
  });

  for (const domain of domains) {
    if (domain === 'app-shell') continue;

    // 30% 확률로 app-shell 레이아웃 Fiber 밑에서 갈라져 나오는 실제 사례를 재현한다.
    // (같은 부모-자식 관계인데 group은 다른 경우 — 지도형 시각화가 이걸 잘 보여주는지가 검증 포인트)
    const useCrossGroupParent = rand() < crossGroupRootRate;
    const rootParentId = useCrossGroupParent ? shellLayoutId : null;

    const rootId = nextId++;
    const rootName = `${domain
      .split('-')
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join('')}Page`;
    nodes.push({ id: rootId, displayName: rootName, kind: 'composite', parentId: rootParentId, group: domain });
    domainRootIds[domain] = rootId;

    const frontier: number[] = [rootId];
    let created = 1;
    let compositeCounter = 0;

    while (created < nodesPerDomain && frontier.length > 0) {
      // 프론티어에서 무작위로 하나 골라 자식을 붙인다(균형 트리보다 실제 컴포넌트 트리에 가까운 들쭉날쭉한 모양).
      const parentIdx = Math.floor(rand() * frontier.length);
      const parentId = frontier[parentIdx];
      const childCount = 1 + Math.floor(rand() * 3);

      for (let i = 0; i < childCount && created < nodesPerDomain; i++) {
        const isAnonymous = rand() < anonymousRate;
        const isHost = !isAnonymous && rand() < 0.35;
        const id = nextId++;

        if (isHost) {
          nodes.push({ id, displayName: pick(HOST_TAGS), kind: 'host', parentId, group: domain });
          // host 노드는 더 이상 자식을 만들지 않는다(리프 취급) — 실제 DOM 리프와 비슷하게.
        } else {
          compositeCounter++;
          const displayName = isAnonymous ? '(anonymous)' : makeCompositeName(domain, compositeCounter);
          nodes.push({ id, displayName, kind: 'composite', parentId, group: domain });
          frontier.push(id);
        }
        created++;
      }

      // 자식을 다 붙인 부모는 프론티어에서 제거해 트리가 옆으로만 안 퍼지고 깊이도 생기게 한다.
      frontier.splice(parentIdx, 1);
    }
  }

  return nodes;
}

export const sampleLarge = generateLargeTree();

// 아래는 "수천 개 노드" 스트레스 테스트용 프리셋(사용자 요청, roadmap.md 미검증 항목).
// nodesPerDomain은 domainCount * nodesPerDomain ≈ 목표 총 노드 수가 되도록 역산했다
// (frontier가 일찍 고갈되는 경우는 거의 없어 오차는 보통 1% 미만).
export const sampleXLarge2000 = generateLargeTree({ seed: 2000, domainCount: 15, nodesPerDomain: 133 });
export const sampleXLarge5000 = generateLargeTree({ seed: 5000, domainCount: 15, nodesPerDomain: 333 });
// 그룹(도메인) 수 자체를 100개+ 로 늘려 지도 모드에서 그룹 라벨이 겹치는지 확인하는 시나리오.
export const sampleManyGroups = generateLargeTree({ seed: 120, domainCount: 120, nodesPerDomain: 25 });
