import { createRoot } from "react-dom/client";
import { MasterPage } from "./MasterPage";
import { SlavePage } from "./SlavePage";
import "./styles.css";

function App() {
  const path = window.location.pathname;
  if (path.startsWith("/master")) return <MasterPage />;
  if (path.startsWith("/slave")) return <SlavePage />;

  return (
    <main className="role-gate">
      <section>
        <p className="eyebrow">AI-KTV</p>
        <h1>本地 KTV 房间</h1>
        <div className="role-actions">
          <a href="/master">打开主屏</a>
          <a href="/slave">打开点歌端</a>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
