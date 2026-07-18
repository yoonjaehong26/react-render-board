import { createContext } from 'react';
import type { RoutingRect, Pt } from '../lib/edgeRouting';

// 크로스-그룹 직교 배선(OrthoEdge, ADR-0029 §5)이 회피할 장애물 = 펼쳐진 그룹 프레임 rect들(flow
// 좌표). Canvas가 flowNodes에서 한 번 계산해 provider로 내려주고, 각 OrthoEdge가 자기 좌표로
// 경로를 낸다. toFlow data에 프레임 목록을 실으면 간선마다 배열이 중복되므로 context로 공유한다.
// (컴포넌트와 분리된 파일로 둬 Fast-Refresh only-export-components 경고를 피한다.)
export const EdgeObstaclesContext = createContext<RoutingRect[]>([]);

// 크로스-그룹 간선의 출발 노드 id → 레인 오프셋(px). Canvas가 모든 크로스-그룹 간선을 한 번에
// 보고 출발 위치 순으로 레인을 배정한다(ADR-0054 v3 중앙 coordination의 Phase 1 — hash 대체).
// 같은 출발은 같은 레인(버스 묶음), 좌→우 순서로 트랙을 나눠 교차를 줄인다. OrthoEdge가 자기
// 출발 id로 조회. 없으면 hash 폴백. 레이아웃 불변이면 memoize돼 커밋마다 재계산 안 함.
export const EdgeLanesContext = createContext<ReadonlyMap<string, number>>(new Map());

// 크로스-그룹 간선 id → 미리 계산된 경로 점열(버스 병합 또는 개별 폴백). Canvas가 모든 크로스-그룹
// 간선을 출발별로 묶어 한 번에 배선(routeCrossGroupBuses, ADR-0054 v3 Phase 2)해 내려준다. 같은
// 출발의 간선은 트렁크+바를 공유(회로도풍)하고, 병합이 프레임을 관통하는 간선만 A*로 폴백된다.
// OrthoEdge는 자기 id로 점열을 조회만 한다(간선별 A*를 중앙 pass로 대체 — 결정2). 맵에 없으면
// (이론상 없음) OrthoEdge가 자기 좌표로 폴백 배선. 레이아웃 불변이면 memoize돼 재계산 안 함.
export const EdgeBusPathsContext = createContext<ReadonlyMap<string, Pt[]>>(new Map());
