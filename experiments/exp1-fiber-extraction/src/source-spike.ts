// 스파이크 전용 (ADR-0007 검증용): bippy의 `bippy/source` 서브패스가 실제로
// 존재하는지, dev/prod 양쪽 빌드에서 파일 경로를 뽑아주는지 확인한다.
//
// architecture.md의 "devtools-only 실행" 원칙과 달리 이 파일은 프로덕션 빌드에서도
// 의도적으로 instrument()를 건다 — 질문 자체가 "프로덕션에서도 되는가"이기 때문이다.
// 이 파일은 검증이 끝나면 걷어낼 스파이크 코드이며, 라이브 MVP에 그대로 재사용하지 않는다.
import {
  instrument,
  isCompositeFiber,
  getDisplayName,
  getFiberId,
  type Fiber,
  type FiberRoot,
} from 'bippy';
import { getSource } from 'bippy/source';

const MAX_DEPTH = 200;
const MAX_COMPOSITE_NODES = 80;

interface SourceProbeResult {
  id: number;
  displayName: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
  raw: unknown;
  error?: string;
}

function collectCompositeFibers(root: Fiber): Fiber[] {
  const found: Fiber[] = [];
  const visited = new Set<number>();

  function walk(fiber: Fiber | null, depth: number) {
    if (!fiber || found.length >= MAX_COMPOSITE_NODES) return;
    if (depth > MAX_DEPTH) return;

    const id = getFiberId(fiber);
    if (visited.has(id)) return;
    visited.add(id);

    if (isCompositeFiber(fiber)) {
      found.push(fiber);
    }

    walk(fiber.child, depth + 1);
    walk(fiber.sibling, depth + 1);
  }

  walk(root, 0);
  return found;
}

async function probeSources(root: Fiber) {
  const composites = collectCompositeFibers(root);
  const results: SourceProbeResult[] = [];

  for (const fiber of composites) {
    const displayName = getDisplayName(fiber.type) ?? '(anonymous)';
    const id = getFiberId(fiber);
    try {
      const source = await getSource(fiber);
      results.push({
        id,
        displayName,
        fileName: source?.fileName,
        lineNumber: source?.lineNumber,
        columnNumber: source?.columnNumber,
        raw: source,
      });
    } catch (err) {
      results.push({ id, displayName, raw: null, error: String(err) });
    }
  }

  const mode = import.meta.env.DEV ? 'dev' : 'prod';
  console.log(`[source-spike:${mode}] commit — ${results.length}개 composite fiber 검사`);
  console.log(`[source-spike:${mode}] results`, JSON.stringify(results, null, 2));

  const withFileName = results.filter((r) => !!r.fileName).length;
  console.log(
    `[source-spike:${mode}] summary: fileName 있음 ${withFileName}/${results.length}`,
  );
}

export function startSourceSpike() {
  instrument({
    name: 'react-render-board-source-spike',
    onCommitFiberRoot(_rendererID: number, root: FiberRoot) {
      probeSources(root.current).catch((err) => {
        console.error('[source-spike] probeSources 실패', err);
      });
    },
  });

  console.log(`[source-spike] started (env: ${import.meta.env.DEV ? 'dev' : 'prod'})`);
}
