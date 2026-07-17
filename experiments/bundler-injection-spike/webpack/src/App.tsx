import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>webpack injection spike</h1>
      <p>This is a trivial app used to prove webpack plugin script injection.</p>
      <button id="counter-button" onClick={() => setCount((c) => c + 1)}>
        count is {count}
      </button>
    </div>
  );
}
