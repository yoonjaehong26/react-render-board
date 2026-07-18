import { useState } from 'react';

// 자기 state(입력값)로 리렌더되는 헤더 검색창 — 타이핑할 때마다 이 노드만 리렌더된다.
export function HeaderSearchBar({ onSubmit }: { onSubmit: (query: string) => void }) {
  const [query, setQuery] = useState('');
  return (
    <form
      className="header-search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(query);
      }}
    >
      <input
        className="header-search__input"
        type="search"
        placeholder="상품을 검색해보세요"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </form>
  );
}
