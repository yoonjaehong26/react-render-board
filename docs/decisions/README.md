# 의사결정 기록 (ADR)

이 폴더는 프로젝트의 주요 결정을 **ADR(Architecture Decision Record)** 형식으로 기록한다. 파일 하나당 결정 하나. "왜 이렇게 결정했는지"를 남겨, 나중에 코드를 다시 짜더라도 판단 근거는 잃지 않게 한다.

새 결정은 [`0000-template.md`](0000-template.md)를 복사해 작성한다.

## 목록

| # | 제목 | 상태 |
|---|---|---|
| [0001](0001-react-only-scope.md) | 범위를 React 전용으로 한정 | 채택됨 |
| [0002](0002-hooking-layer.md) | 훅킹 레이어를 직접 구현하지 않고 위임 | 채택됨(라이브러리 미확정) |
| [0003](0003-project-name.md) | 프로젝트 이름 `react-render-board` | 채택됨 |
| [0004](0004-docs-in-repo.md) | 문서를 GitHub 레포의 `.md`로 관리 | 채택됨 |
