// 노드의 "실제 그룹"을 계산한다. RenderNode.groupHint는 composite 노드에만, 그것도
// 비동기로 채워지므로(ADR-0007) host 노드나 아직 안 채워진 composite 노드는 조상 체인을
// 거슬러 올라가 가장 가까운 "그룹이 resolve된" composite 조상의 그룹을 물려받는다.
// 그 조상까지도 못 찾으면(트리 루트까지 아무도 resolve 안 됨) 임시 버킷(PENDING_GROUP)에 둔다.
//
// 그룹핑 노이즈 흡수 (ADR-0009 ①, ADR-0010): UI 라이브러리(Radix 등)가 자기 자신의 내부
// 컴포넌트를 합성해서 렌더하면(예: 앱의 DropdownMenuTrigger.tsx가 Radix의 Popper/Primitive/
// Slot/Presence를 내부적으로 렌더), 그 안쪽 composite들의 getSource("사용 위치")는 앱 코드가
// 아니라 라이브러리 패키지 자신의 소스 파일을 가리킨다 — 그룹 목록에 node_modules 내부 경로가
// 섞여 들어간다. isLibraryInternalHint로 이런 groupHint를 "아직 앱 소스로 resolve되지 않음"과
// 동일하게 취급해 조상 체인을 계속 거슬러 올라가고, 가장 가까운 "앱 소스" composite 조상의
// 그룹으로 흡수한다 — 화면에 낯선 node_modules 경로가 별도 그룹으로 노출되지 않는다.
import type { RenderNode } from '../../data/types';

export const PENDING_GROUP = '__pending__';

/**
 * groupHint가 "프로젝트 소스"가 아니라(=라이브러리 자신의 소스일 가능성이 높아) 조상에게
 * 흡수시켜야 하는지 판단한다 (ADR-0016 ④).
 *
 * 예전 버전은 `node_modules` 리터럴 문자열만 봤는데, Vite의 의존성 프리번들 캐시
 * (`node_modules/.vite/deps/`)가 만드는 소스맵은 "sources"를 그 캐시 디렉터리 기준
 * 상대경로로 적어 `node_modules` 세그먼트 자체가 사라진다 — 예:
 * `../../@radix-ui/react-dropdown-menu/dist/index.mjs`(shadcn-admin),
 * `../../@mui/material/esm/styles/ThemeProvider.js`(berry-admin). ADR-0015가 두 실제 앱
 * 모두에서 독립적으로 재현했다.
 *
 * 그래서 판별을 뒤집는다: "라이브러리처럼 보이는 패턴을 찾는" 블랙리스트 대신 "프로젝트
 * 소스 루트 밖으로 나가는 경로인가"를 화이트리스트 반전으로 판단한다. 지금까지 검증한 4개
 * 앱(자체 fixture, excalidraw, shadcn-admin, berry-admin) 전부에서 앱 소스 groupHint는
 * 예외 없이 파일명만(상위 디렉터리 접두사 없이) 나왔다 — getSource가 돌려주는 "sources"
 * 항목이 그 파일 자신의 소스맵에서 자기 자신을 가리키는 상대경로라 위로 거슬러 올라갈
 * 필요가 없기 때문으로 보인다. 반대로 지금까지 관찰된 모든 라이브러리 내부 경로는 예외
 * 없이 상위 디렉터리 이탈(`../`)로 시작했다 — 프리번들 캐시 "밖"의 실제 node_modules
 * 위치를 가리켜야 하기 때문이다. 따라서 `../`로 시작하는 groupHint는 프로젝트 소스 루트
 * 밖(라이브러리)으로 간주한다.
 */
export function isLibraryInternalHint(groupHint: string): boolean {
  if (/(^|[/\\])node_modules[/\\]/.test(groupHint)) return true; // 리터럴 매칭도 여전히 유효한 하위 케이스.
  if (/^\.\.[/\\]/.test(groupHint)) return true; // 상위 디렉터리 이탈 = 프로젝트 소스 루트 밖.
  return false;
}

export function resolveEffectiveGroups(nodes: RenderNode[]): Map<number, string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const resolved = new Map<number, string>();

  function resolve(id: number): string {
    const cached = resolved.get(id);
    if (cached) return cached;

    const node = byId.get(id);
    if (!node) return PENDING_GROUP;

    const hasAppHint = node.kind === 'composite' && !!node.groupHint && !isLibraryInternalHint(node.groupHint);

    let group: string;
    if (hasAppHint) {
      group = node.groupHint!;
    } else if (node.parentId === null) {
      // 조상 체인 끝까지 앱 소스 그룹을 못 찾았다. 라이브러리 힌트라도 있으면 그거라도 쓰고
      // (완전히 정보가 없는 것보다 낫다), 그마저 없으면 pending.
      group = node.kind === 'composite' && node.groupHint ? node.groupHint : PENDING_GROUP;
    } else {
      group = resolve(node.parentId);
    }

    resolved.set(id, group);
    return group;
  }

  for (const n of nodes) resolve(n.id);
  return resolved;
}
