import { createContext } from 'react';
import type { RoutingRect } from '../lib/edgeRouting';

// 크로스-그룹 직교 배선(OrthoEdge, ADR-0029 §5)이 회피할 장애물 = 펼쳐진 그룹 프레임 rect들(flow
// 좌표). Canvas가 flowNodes에서 한 번 계산해 provider로 내려주고, 각 OrthoEdge가 자기 좌표로
// 경로를 낸다. toFlow data에 프레임 목록을 실으면 간선마다 배열이 중복되므로 context로 공유한다.
// (컴포넌트와 분리된 파일로 둬 Fast-Refresh only-export-components 경고를 피한다.)
export const EdgeObstaclesContext = createContext<RoutingRect[]>([]);
