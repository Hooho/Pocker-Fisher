import { ArrowUpRight, Check, ChevronRight, Medal, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import type { Character } from "../domain/game/engine";
import type { Tournament } from "../domain/storage/storage";

type TournamentPageProps = {
  tournament: Tournament | null;
  completedStandings: Character[];
  userPlayerName: string;
  tournamentRecordsCount: number;
  rounds: readonly string[];
  counts: readonly number[];
  roundLabel: (round: number) => string;
  onPrimaryAction: () => void;
  simulationProgress: ReactNode;
  onViewLeaderboard: () => void;
  renderAvatar: (player: Character) => ReactNode;
};

export function TournamentPage({
  tournament: t,
  completedStandings,
  userPlayerName,
  tournamentRecordsCount,
  rounds,
  counts,
  roundLabel,
  onPrimaryAction,
  simulationProgress,
  onViewLeaderboard,
  renderAvatar,
}: TournamentPageProps) {
  return (
    <div className={`content-page${t?.complete ? " championship-complete-page" : ""}`}>
      <div className="page-heading championship-heading">
        <div>
          <h1>冠军赛</h1>
          <p className="muted">
            {t?.complete
              ? "本届赛事已结束，以下为最终名次。"
              : t?.resetStacksEachRound
                ? "64 位选手同时分桌比赛，晋级进入下一轮时全部重置为 10,000 筹码。"
                : "64 位选手同时分桌比赛，晋级选手带着当前筹码进入下一轮。"}
          </p>
        </div>
        <div className="championship-actions">
          <button className="gold-button" onClick={onPrimaryAction}>
            {t?.out && !t.simulationComplete ? "查看模拟进度" : t?.complete ? "再开一届" : t ? "返回比赛" : "亲自参赛"}
            <ArrowUpRight size={17} />
          </button>
        </div>
      </div>
      {t?.complete ? (
        completedStandings.length ? (
          <section className="championship-results championship-results-complete" aria-labelledby="championship-results-title">
            <div className="championship-results-heading">
              <div>
                <small>FINAL RESULTS</small>
                <h2 id="championship-results-title">本届最终名次</h2>
              </div>
              <span>总决赛</span>
            </div>
            <div className="championship-podium" aria-label="前三名颁奖台">
              {[1, 0, 2].map((standingIndex) => {
                const player = completedStandings[standingIndex];
                if (!player) return null;
                const place = standingIndex + 1;
                return (
                  <article className={`podium-place place-${place}`} key={player.id}>
                    <div className="podium-player">
                      <span className="podium-award" aria-hidden="true">
                        {place === 1 ? <Trophy size={22} /> : <Medal size={20} />}
                      </span>
                      {renderAvatar(player)}
                      <span className="podium-player-name">
                        <small>第 {place} 名{place === 1 ? " · 冠军" : ""}</small>
                        <strong>{player.id === -1 ? userPlayerName : player.name}</strong>
                      </span>
                    </div>
                    <div className="podium-step"><b>{String(place).padStart(2, "0")}</b></div>
                  </article>
                );
              })}
            </div>
            <div className="finalists-list" aria-label="第四至第八名">
              <div className="finalists-list-heading">
                <h3>第四至第八名</h3>
                <span>其余晋级选手</span>
              </div>
              <ol start={4}>
                {completedStandings.slice(3, 8).map((player, index) => (
                  <li key={player.id}>
                    <b className="finalist-rank">{index + 4}</b>
                    {renderAvatar(player)}
                    <strong>{player.id === -1 ? userPlayerName : player.name}</strong>
                    <span>第 {index + 4} 名</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ) : (
          <section className="championship-results-empty" role="status">
            <Medal size={24} />
            <strong>本届赛事已结束</strong>
            <span>暂时没有可显示的最终排名记录。</span>
          </section>
        )
      ) : (
        <>
          <div className="tournament-summary">
            <Trophy size={46} />
            <div>
              <h2>{t ? (t.out ? "你已出局 · 正在模拟剩余赛事" : roundLabel(t.round)) : "四轮比赛，一场属于你的征程"}</h2>
              <p>
                {t
                  ? `${t.field.length} 位本轮选手 · ${t.results.length} 次晋级${t.background && !t.background.done ? ` · 其他桌剩余 ${t.background.remaining.length} 人` : ""}`
                  : "首轮、次轮和半决赛分桌晋级，最后八人进入总决赛。"}
              </p>
            </div>
            <b>64 <span>→ 1</span></b>
          </div>
          {t?.out && !t.simulationComplete ? simulationProgress : null}
          <div className="rounds">
            {rounds.map((name, i) => (
              <div
                className={`round ${t && Math.min(t.round, rounds.length - 1) === i ? "current" : ""} ${t && t.round > i ? "passed" : ""}`}
                key={name}
              >
                <div className="round-number">
                  {t && t.round > i ? <Check size={20} /> : String(i + 1).padStart(2, "0")}
                </div>
                <div>
                  <small>{i < 3 ? "分组晋级" : "冠军桌"}</small>
                  <h3>{name}</h3>
                </div>
                <span>{counts[i]} 人</span>
                <ChevronRight size={18} />
              </div>
            ))}
          </div>
          <div className="records-teaser">
            <span><Medal size={16} /> 已保存 <b>{tournamentRecordsCount}</b> 届赛事</span>
            <button onClick={onViewLeaderboard}>查看积分榜 <ChevronRight size={15} /></button>
          </div>
        </>
      )}
    </div>
  );
}
