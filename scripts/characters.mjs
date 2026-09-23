import { writeFileSync } from "node:fs";
const surnames = [
  "林",
  "陈",
  "沈",
  "陆",
  "顾",
  "江",
  "许",
  "周",
  "苏",
  "秦",
  "程",
  "叶",
  "唐",
  "宋",
  "温",
  "段",
  "傅",
  "萧",
  "白",
  "韩",
];
const names = [
  "知远",
  "晚晴",
  "墨",
  "予安",
  "星野",
  "以宁",
  "见山",
  "听澜",
  "清和",
  "南舟",
  "时雨",
  "云深",
  "景行",
  "望舒",
  "亦川",
  "书言",
  "若溪",
  "承宇",
  "子衿",
  "明澈",
  "青禾",
  "怀瑾",
  "向晚",
  "修远",
  "霁月",
  "知夏",
  "松言",
  "庭风",
  "初霁",
  "行之",
  "牧之",
  "云舟",
  "秋白",
  "长宁",
  "北辰",
  "言蹊",
  "岚",
  "闻溪",
  "悠然",
  "砚秋",
  "景明",
  "惜言",
  "远山",
  "映雪",
  "如风",
  "时安",
  "沐阳",
  "疏桐",
  "念初",
  "临川",
];
const styles = [
  "紧手稳健",
  "松手激进",
  "松手被动",
  "紧手被动",
  "均衡多变",
  "善于适应",
];
const colors = [
  "#687c69",
  "#b39069",
  "#748896",
  "#a47162",
  "#8b7c96",
  "#83948b",
];
const roles = Array.from({ length: 63 }, (_, i) => {
  const c = colors[i % 6];
  const hair = ["#292821", "#403127", "#d0c6b0", "#1e2729"][i % 4];
  const skin = ["#d8ae8e", "#c28d6e", "#e5c8aa", "#ac795e"][
    Math.floor(i / 3) % 4
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="${c}"/><circle cx="75" cy="18" r="35" fill="#ffffff" opacity=".08"/><path d="M10 100Q15 65 50 67Q85 65 90 100" fill="${hair}"/><path d="M40 61h20v17q-10 10-20 0" fill="${skin}"/><ellipse cx="50" cy="43" rx="22" ry="28" fill="${skin}"/><path d="M27 43Q19 8 49 9Q79 8 74 45L66 29Q${40 + (i % 15)} 43 31 29Z" fill="${hair}"/><path d="M37 46h5m16 0h5" stroke="#352c28" stroke-width="2" stroke-linecap="round"/><path d="M46 60q5 3 10-1" fill="none" stroke="#885b4d" stroke-width="1.5"/>${i % 5 === 0 ? '<path d="M32 41h15v12H32zm21 0h15v12H53zm-6 4h6" fill="none" stroke="#30352f" stroke-width="2"/>' : ""}<path d="M32 79l18 15 18-15" fill="none" stroke="${c}" stroke-width="3"/></svg>`;
  writeFileSync(`public/avatars/${i}.svg`, svg);
  return {
    id: i,
    name:
      surnames[Math.floor(i / 15) % 20] +
      names[(i % 15) + Math.floor(i / 300) * 15],
    style: styles[i % 6],
    level: 1 + (i % 5),
    aggression: [0.48, 0.82, 0.25, 0.18, 0.58, 0.6][i % 6],
    bluff: [0.13, 0.32, 0.08, 0.04, 0.2, 0.18][i % 6],
    bio: [
      "耐心等待，抓住真正值得出手的机会。",
      "喜欢掌握节奏，让对手面对艰难的选择。",
      "相信下一张牌，总愿意再看一眼。",
      "谨慎守护筹码，只在把握充足时出手。",
      "在进攻与克制之间寻找平衡。",
      "观察每一次下注，寻找对手的习惯。",
    ][i % 6],
  };
});
writeFileSync("public/characters.json", JSON.stringify(roles));
