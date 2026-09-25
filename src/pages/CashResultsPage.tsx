import { ArrowLeft, ArrowUpRight, Crown, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import type { Character } from "../domain/game/engine";

export type CashMatchStanding = {
  place: number;
  player: Character;
  chips: number;
};
export type CashMatchResult = {
  playedAt: string;
  entrants: number;
  standings: CashMatchStanding[];
};

type CashResultsPageProps = {
  result: CashMatchResult | undefined;
  userPlayerName: string;
  onNewMatch: () => void;
  onBackToLobby: () => void;
  renderAvatar: (player: CashMatchResult["standings"][number]["player"]) => ReactNode;
};

export function CashResultsPage({
  result,
  userPlayerName,
  onNewMatch,
  onBackToLobby,
  renderAvatar,
}: CashResultsPageProps) {
  const standings = result?.standings || [];

  return (
    <div className="content-page cash-results-page">
      <div className="page-heading cash-results-heading">
        <div>
          <p className="eyebrow">TABLE RESULTS</p>
          <h1>单次赛结算</h1>
          <p className="muted">
            {result ? `${result.entrants} 人牌桌已结束，以下是本场最终名次。` : "还没有可查看的单次赛结算。"}
          </p>
        </div>
        <div className="cash-results-actions">
          <button type="button" className="gold-button" onClick={onNewMatch}>
            再开一场 <ArrowUpRight size={17} />
          </button>
          <button type="button" onClick={onBackToLobby}>
            <ArrowLeft size={16} /> 返回大厅
          </button>
        </div>
      </div>

      {standings.length ? (
        <section className="cash-results-card" aria-labelledby="cash-results-title">
          <div className="cash-results-card-heading">
            <div>
              <h2 id="cash-results-title">最终排名</h2>
            </div>
            <span>筹码决定名次</span>
          </div>
          <ol className="cash-results-list">
            {standings.map((standing) => {
              const isLocalPlayer = standing.player.id === -1;
              return (
                <li className={standing.place === 1 ? "cash-result-winner" : undefined} key={standing.player.id}>
                  <span className="cash-result-place">{String(standing.place).padStart(2, "0")}</span>
                  <span className="cash-result-avatar">{renderAvatar(standing.player)}</span>
                  <span className="cash-result-player">
                    <strong>{isLocalPlayer ? userPlayerName : standing.player.name}</strong>
                    <small>
                      {standing.place === 1 ? <><Crown size={12} /> 本场冠军</> : `第 ${standing.place} 名`}
                    </small>
                  </span>
                  <span className="cash-result-chips">{standing.chips.toLocaleString()} <small>筹码</small></span>
                  {standing.place === 1 ? <Trophy className="cash-result-trophy" size={20} aria-hidden="true" /> : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <section className="cash-results-empty" role="status">
          <Trophy size={26} />
          <strong>暂无单次赛结算</strong>
          <span>完成一场单次赛后，最终名次会显示在这里。</span>
        </section>
      )}
    </div>
  );
}
