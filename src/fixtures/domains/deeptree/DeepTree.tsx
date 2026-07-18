// 간선 클러터 감쇠(ADR-0029 결정 #4) 데모/검증용 fixture.
//
// 기존 fixture들은 그룹핑이 `getSource`의 "사용 위치" 기준이라(ADR-0007), 한 파일에서 정의·사용된
// 컴포넌트만 한 그룹으로 묶인다. 그런데 대부분의 fixture는 한 그룹 안 깊이가 최대 2라(예: DataFlow의
// List→Row→Badge) "깊이 3 이상 = detail 간선"이라는 LOD 분기가 실제로 발생하지 않는다.
//
// 여기서는 Level1~Level6을 전부 이 한 파일 안에서 정의하고 서로 중첩해 렌더한다 — 전부 같은 그룹
// (DeepTree.tsx)으로 묶이면서 그룹 내 깊이가 1~5까지 이어진다. 덕분에:
//   - 그룹 내 간선이 깊을수록 옅어지는 시각적 감쇠(연구문서 7절 a)를 한 그룹에서 다 볼 수 있고,
//   - 깊이 3 이상(Level3→Level4 이하)의 detail 간선이 중간 줌에서 숨었다가 줌인하면 나타나는
//     단계형 LOD(7절 b)를 실제로 관찰할 수 있다.
// 실제 서드파티 앱(excalidraw 646노드 등)은 이보다 훨씬 깊은 동일-파일 서브트리를 갖지만,
// 자체 fixture로도 그 상황을 재현하려고 둔 것이다.

function Level6() {
  return <div className="deeptree-leaf">잎(깊이 5)</div>;
}

function Level5() {
  return (
    <div>
      <Level6 />
    </div>
  );
}

function Level4() {
  return (
    <div>
      <Level5 />
    </div>
  );
}

function Level3() {
  return (
    <div>
      <Level4 />
    </div>
  );
}

function Level2() {
  return (
    <div>
      <Level3 />
    </div>
  );
}

function Level1() {
  return (
    <div>
      <Level2 />
    </div>
  );
}

export function DeepTree() {
  return (
    <section>
      <h2>DeepTree — 깊은 동일-그룹 중첩(간선 감쇠/LOD 데모)</h2>
      <Level1 />
    </section>
  );
}
