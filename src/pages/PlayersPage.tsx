import { ArrowUpRight, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { Character } from "../engine";

type PlayersPageProps = {
  characters: Character[];
  levels: readonly string[];
  embedded?: boolean;
  profile: (player: Character) => Character;
  onOpenPlayerProfile: (player: Character) => void;
  onOpenBatch: () => void;
  renderAvatar: (player: Character) => ReactNode;
};

export function PlayersPage({
  characters,
  levels,
  embedded = false,
  profile,
  onOpenPlayerProfile,
  onOpenBatch,
  renderAvatar,
}: PlayersPageProps) {
  return (
    <>
      {!embedded ? (
        <div className="page-heading">
          <div>
            <h1>每个人，都有自己的底牌。</h1>
            <p className="muted">63 位固定选手，不同的性格，相同的公平规则。</p>
          </div>
          <span className="pill">
            <Sparkles size={14} /> 支持 AI 人物塑造
          </span>
        </div>
      ) : null}
      <div className="batch-bar">
        <span>支持逐个塑造，也可以批量更新选手列表。</span>
        <button onClick={onOpenBatch}>
          <Sparkles size={15} />
          批量 AI 塑造
        </button>
      </div>
      <div className="character-grid">
        {characters.map((raw) => {
          const player = profile(raw);
          return (
            <button
              className="character-card"
              key={player.id}
              onClick={() => onOpenPlayerProfile(raw)}
            >
              {renderAvatar(player)}
              <span className="character-level">{levels[player.level - 1]}</span>
              <h3>
                <span>{player.name}</span>
                <ArrowUpRight className="character-profile-icon" size={15} aria-hidden="true" />
              </h3>
              <span className="style-tag">{player.style}</span>
              <p>{player.bio}</p>
            </button>
          );
        })}
      </div>
    </>
  );
}
