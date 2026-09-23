import { RotateCcw, Sparkles, UserRound, Users } from "lucide-react";
import type { ReactNode } from "react";

export type SettingsSection = "ai" | "players" | "profile" | "reset";

type SettingsPageProps = {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  aiContent: ReactNode;
  playersContent: ReactNode;
  profileContent: ReactNode;
  resetContent: ReactNode;
};

export function SettingsPage({
  section,
  onSectionChange,
  aiContent,
  playersContent,
  profileContent,
  resetContent,
}: SettingsPageProps) {
  return (
    <div className="content-page settings-page">
      <aside className="settings-menu" aria-label="设置菜单">
        <h1>设置</h1>
        <button
          className={section === "ai" ? "active" : ""}
          aria-current={section === "ai" ? "page" : undefined}
          onClick={() => onSectionChange("ai")}
        >
          <Sparkles size={17} /> AI 设置
        </button>
        <button
          className={section === "players" ? "active" : ""}
          aria-current={section === "players" ? "page" : undefined}
          onClick={() => onSectionChange("players")}
        >
          <Users size={17} /> 电脑选手
        </button>
        <button
          className={section === "profile" ? "active" : ""}
          aria-current={section === "profile" ? "page" : undefined}
          onClick={() => onSectionChange("profile")}
        >
          <UserRound size={17} /> 个人资料
        </button>
        <button
          className={section === "reset" ? "active" : ""}
          aria-current={section === "reset" ? "page" : undefined}
          onClick={() => onSectionChange("reset")}
        >
          <RotateCcw size={17} /> 重置
        </button>
      </aside>
      <section className="settings-panel">
        {section === "ai"
          ? aiContent
          : section === "players"
            ? playersContent
            : section === "profile"
              ? profileContent
              : resetContent}
      </section>
    </div>
  );
}
